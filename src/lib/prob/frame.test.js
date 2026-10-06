import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createPosition } from './position.js';
import { computeFrame, meaning, productFrame } from './frame.js';
import { atU, lerp } from './dist.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) < tol, `${msg ?? ''} ${a} vs ${b}`);

describe('frame', () => {
    it('discrete, x between atoms: the area is the sum over atoms reached', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(2.5);
        const fr = computeFrame(m, pos, 'x');
        const p = m.p;
        close(fr.area, 1 * p[0] + 2 * p[1], 1e-12);
        assert.equal(fr.k, 1);                     // last atom reached, 0-based
        close(fr.total, p.reduce((t, v, i) => t + v * (i + 1), 0), 1e-12);
    });
    it('discrete, u inside a block: the block fills up to u', () => {
        const m = createModel(), pos = createPosition(m);
        const F = m.view().F;
        pos.setU((F[2] + F[3]) / 2);
        const fr = computeFrame(m, pos, 'x2');
        close(fr.area, 1 * m.p[0] + 4 * m.p[1] + 9 * (fr.u - F[2]), 1e-12);
        assert.equal(fr.k, 2);
    });
    it('discrete, before any atom: nothing accumulated', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setU(0);
        const fr = computeFrame(m, pos, 'neglog');
        assert.equal(fr.k, -1);
        assert.equal(fr.area, 0);
        assert.ok(Number.isNaN(fr.gNow));
    });
    it('continuous: −log₂ p_X totals to h, and x totals to the mean', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m);
        close(computeFrame(m, pos, 'neglog').total, 0.5 * Math.log2(2 * Math.PI * Math.E * 0.04), 1e-3);
        close(computeFrame(m, pos, 'x').total, 0, 1e-4);
        pos.setU(1);
        const fr = computeFrame(m, pos, 'x2');
        close(fr.area, fr.total, 1e-9);
        close(fr.total, 0.04, 1e-4);               // E[X²] = σ²
    });
});

describe('frame outside the support', () => {
    it('steps: p_X is 0 outside the support and the height stays finite', () => {
        const m = createModel(); m.setCase('cont'); m.setPreset('steps');
        const pos = createPosition(m);
        pos.setX(m.view().xRange[0]);
        const fr = computeFrame(m, pos, 'neglog');
        assert.equal(fr.fNow, 0);
        assert.ok(Number.isFinite(fr.gNow));
    });
});

describe('frame: what each g computes', () => {
    it('(x − E X)² totals to the variance, in both cases', () => {
        const m = createModel(), pos = createPosition(m);
        const p = m.p, mean = p.reduce((t, q, i) => t + q * (i + 1), 0);
        close(computeFrame(m, pos, 'var').total, p.reduce((t, q, i) => t + q * (i + 1 - mean) ** 2, 0), 1e-12);
        m.setCase('cont');
        close(computeFrame(m, pos, 'var').total, 0.04, 1e-4);   // σ² of the Gaussian preset
        pos.setU(0.9);
        const fr = computeFrame(m, pos, 'var');
        close(fr.gNow, (lerp(m.view().S.xs, atU(m.view().S, 0.9)) - 0) ** 2, 1e-3);   // the height at u, mean 0
    });
    it('a custom g takes its values from the given list, one per atom', () => {
        const m = createModel(), pos = createPosition(m);
        const c = [1, -2, 0.5, 3, -1, 0, 2, -0.5];
        const fr = computeFrame(m, pos, 'custom', c);
        assert.deepEqual(fr.gs, c);
        close(fr.total, c.reduce((t, y, i) => t + y * m.p[i], 0), 1e-12);
    });
    it('names the quantity for the named g, and nothing for a custom one', () => {
        assert.equal(meaning('x', true).tex, '\\mathbb{E}[X]');
        assert.equal(meaning('x', true).name, 'mean');
        assert.equal(meaning('x2', false).name, 'second moment');
        assert.equal(meaning('var', true).name, 'variance');
        assert.equal(meaning('neglog', true).tex, 'H(X)');
        assert.equal(meaning('neglog', false).tex, 'h(X)');
        assert.equal(meaning('custom', true), null);
    });
});

describe('frame: atoms without mass', () => {
    it('have no value of g, and add nothing, even for −log p_X or a custom g', () => {
        const m = createModel(), pos = createPosition(m);
        m.setPreset('uniform'); m.editPmf(3, 0);
        for (const [g, c] of [['neglog'], ['x'], ['custom', [1, 2, 3, 99, 5, 6, 7, 8]]]) {
            const fr = computeFrame(m, pos, g, c);
            assert.ok(Number.isNaN(fr.gs[3]), g);
            assert.ok(Number.isFinite(fr.total), g);
        }
        close(computeFrame(m, pos, 'neglog').total, Math.log2(7), 1e-12);
        const c = [1, 2, 3, 99, 5, 6, 7, 8];
        close(computeFrame(m, pos, 'custom', c).total, (1 + 2 + 3 + 5 + 6 + 7 + 8) / 7, 1e-12);
    });
    it('are never where u lands', () => {
        const m = createModel(), pos = createPosition(m);
        m.setPreset('uniform'); m.editPmf(3, 0);
        const F = m.view().F;                        // F[3] = F[4]: atom 4 has an empty block
        for (const u of [F[3], F[3] + 1e-9]) {
            pos.setU(u);
            assert.notEqual(computeFrame(m, pos, 'x').k, 3, String(u));
        }
    });
});

describe('frame: skewness', () => {
    it('((x − E X)/σ)³ totals to the skewness: Σ p z³, positive for zipf, 0 for the Gaussian', () => {
        const m = createModel(), pos = createPosition(m);
        const p = m.p, mean = p.reduce((t, q, i) => t + q * (i + 1), 0);
        const sd = Math.sqrt(p.reduce((t, q, i) => t + q * (i + 1 - mean) ** 2, 0));
        const want = p.reduce((t, q, i) => t + q * ((i + 1 - mean) / sd) ** 3, 0);
        const fr = computeFrame(m, pos, 'skew');
        close(fr.total, want, 1e-12);
        assert.ok(fr.total > 0);
        assert.ok(fr.gs.some(y => y < 0));             // it takes both signs
        m.setCase('cont');
        close(computeFrame(m, pos, 'skew').total, 0, 1e-3);
        assert.equal(meaning('skew', true).name, 'skewness');
    });
    it('is undefined when X is constant: no values, no total', () => {
        const m = createModel(), pos = createPosition(m);
        m.setPreset('onehot');
        const fr = computeFrame(m, pos, 'skew');
        assert.ok(fr.gs.every(y => Number.isNaN(y)));
        assert.ok(Number.isNaN(fr.total));
    });
});

describe('the same expectation over the real line: g · p_X', () => {
    it('discrete: one weight g(x) p_X(x) per atom, summed over the atoms up to x', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(3);
        const fr = computeFrame(m, pos, 'neglog'), pr = productFrame(fr);
        pr.ys.forEach((y, i) => close(y, fr.gs[i] * m.p[i], 1e-12));
        close(pr.upto, fr.cum[3], 1e-12);            // atoms 1, 2, 3
        close(pr.upto, fr.area, 1e-12);              // = the area up to u = F_X(3)
        pos.setX(8.5);
        close(productFrame(computeFrame(m, pos, 'neglog')).upto, fr.total, 1e-12);
    });
    it('discrete: atoms without mass carry no weight', () => {
        const m = createModel(), pos = createPosition(m);
        m.setPreset('uniform'); m.editPmf(3, 0);
        const pr = productFrame(computeFrame(m, pos, 'neglog'));
        assert.ok(Number.isNaN(pr.ys[3]));
    });
    it('continuous: the area under g p_X up to x is the area up to u = F_X(x)', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m);
        pos.setX(0.1);
        const fr = computeFrame(m, pos, 'x'), pr = productFrame(fr);
        close(pr.upto, fr.area, 1e-9);
        assert.equal(pr.ys.length, fr.S.xs.length);
        pos.setU(1);                                  // x = +∞: the whole integral
        const f1 = computeFrame(m, pos, 'x');
        close(productFrame(f1).upto, f1.total, 1e-12);
    });
});
