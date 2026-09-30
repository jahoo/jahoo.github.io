import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, DISC_PRESETS, CONT_PRESETS } from './model.js';

const sum = a => a.reduce((x, y) => x + y, 0);

describe('model', () => {
    it('starts discrete on zipf; the discrete presets are uniform, zipf and one-hot', () => {
        const m = createModel();
        assert.deepEqual(Object.keys(DISC_PRESETS), ['uniform', 'zipf', 'onehot']);
        assert.equal(m.discKey, 'zipf');
        assert.deepEqual(DISC_PRESETS.onehot.p.filter(v => v > 0), [1]);
        assert.equal(m.kase, 'disc');
        assert.equal(m.p.length, 8);
        assert.ok(Math.abs(sum(m.p) - 1) < 1e-12);
        assert.deepEqual(m.view().xRange, [0.5, 8.5]);
    });
    it('every preset is normalized', () => {
        for (const k of Object.keys(DISC_PRESETS)) { const m = createModel(); m.setPreset(k); assert.ok(Math.abs(sum(m.p) - 1) < 1e-12, k); }
        for (const k of Object.keys(CONT_PRESETS)) { const m = createModel(); m.setCase('cont'); m.setPreset(k); const S = m.view().S; assert.ok(Math.abs(S.Fs[S.Fs.length - 1] - 1) < 1e-6, k); }
    });
    it('editPmf hits the target, keeps the total, notifies', () => {
        const m = createModel(); let n = 0; m.subscribe(() => n++);
        m.editPmf(3, 0.5);
        assert.ok(Math.abs(m.p[3] - 0.5) < 1e-12);
        assert.ok(Math.abs(sum(m.p) - 1) < 1e-12);
        assert.equal(n, 1);
    });
    it('editPmf can take an atom to zero: it pops there near the axis', () => {
        const m = createModel();
        m.editPmf(2, 0.01);
        assert.equal(m.p[2], 0);
        assert.ok(Math.abs(sum(m.p) - 1) < 1e-12);
    });
    it('the custom preset brings back the last edited pmf', () => {
        const m = createModel();
        m.editPmf(0, 0.6);
        const edited = m.p.slice();
        assert.equal(m.discKey, 'custom');
        m.setPreset('uniform');
        m.setPreset('custom');
        assert.deepEqual(m.p, edited);
        assert.equal(m.discKey, 'custom');
    });
    it('setShape replaces the samples', () => {
        const m = createModel(); m.setCase('cont');
        const before = m.view().S;
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0.1, s: 0.3 }] });
        assert.notEqual(m.view().S, before);
        assert.ok(Math.abs(m.view().S.peak - 1 / (0.3 * Math.sqrt(2 * Math.PI))) < 1e-3);
    });
    it('the window holds during a drag, grows when pressed, recomputes on release', () => {
        const m = createModel(); m.setCase('cont');
        const w0 = { ...m.view().win };
        m.hold(true);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0, s: 0.22 }] });   // slightly wider: no change
        assert.deepEqual(m.view().win, w0);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0, s: 0.02 }] });   // peak far above the top: grows
        assert.ok(m.view().win.y1 > w0.y1);
        const grown = { ...m.view().win };
        m.hold(false);
        assert.deepEqual(m.view().win, grown);                          // releasing does not jump the axes
    });
    it('during a drag the window grows to keep 99.9% of the mass in view, even with the mean inside', () => {
        const m = createModel(); m.setCase('cont');
        m.hold(true);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0.75, s: 0.3 }] });   // mean inside, a third of the mass past the edge
        const { win, S } = m.view();
        const q = u => S.xs[S.Fs.findIndex(F => F >= u)];
        assert.ok(win.x1 >= q(0.999), `${win.x1} vs ${q(0.999)}`);
        assert.ok(win.x0 <= q(0.001));
        m.hold(false);
    });
    it('choosing a preset refits the window', () => {
        const m = createModel(); m.setCase('cont');
        m.hold(true); m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0, s: 0.02 }] }); m.hold(false);
        const grown = { ...m.view().win };
        m.setPreset('gauss');
        assert.ok(m.view().win.y1 < grown.y1);
    });
});

describe('model reset', () => {
    it('undoes edits, presets, the case and a grown window: the view is a fresh model\'s', () => {
        const fresh = createModel().view();
        const m = createModel();
        m.editPmf(2, 0.5);
        m.setCase('cont'); m.hold(true);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0.75, s: 0.3 }] });   // grows the window
        m.hold(false); m.setPreset('steps');
        let n = 0; m.subscribe(() => n++);
        m.reset();
        assert.equal(n, 1);
        assert.equal(m.kase, 'disc');
        assert.equal(m.discKey, 'zipf'); assert.equal(m.contKey, 'gauss');
        assert.deepEqual(m.view().p, fresh.p);
        m.setCase('cont');
        const c = createModel(); c.setCase('cont');
        assert.deepEqual(m.view().win, c.view().win);
        assert.deepEqual(m.shape, c.shape);
        m.setCase('disc'); m.setPreset('custom');
        assert.deepEqual(m.p, fresh.p);                 // the edited pmf is forgotten
    });
});
