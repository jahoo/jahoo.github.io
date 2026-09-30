import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createPosition } from './position.js';

describe('position', () => {
    it('discrete: setX counts an atom once x reaches it', () => {
        const m = createModel(), pos = createPosition(m), F = m.view().F;
        pos.setX(0.99); assert.equal(pos.u, 0);
        pos.setX(1); assert.ok(Math.abs(pos.u - F[1]) < 1e-12);
        pos.setX(1.5); assert.ok(Math.abs(pos.u - F[1]) < 1e-12);
        assert.equal(pos.driver, 'x');
    });
    it('discrete: setU puts x on the atom whose block holds u', () => {
        const m = createModel(), pos = createPosition(m), F = m.view().F;
        pos.setU((F[2] + F[3]) / 2); assert.equal(pos.x, 3);
        pos.setU(0); assert.equal(pos.x, 0.5);
        pos.setU(1); assert.equal(pos.x, 8);
        assert.equal(pos.driver, 'u');
    });
    it('continuous: F_X⁻¹(1) is +∞ for unbounded support, the support\'s end for steps', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m);
        pos.setU(1); assert.equal(pos.x, Infinity);
        m.setPreset('steps'); pos.refresh();
        assert.ok(Math.abs(pos.x - m.view().shape.ts.at(-1)) < 1e-2, String(pos.x));
        pos.setU(0.999); assert.ok(Number.isFinite(pos.x));
    });
    it('continuous: dragging x to the right edge of an unbounded support snaps it to +∞ with u = 1', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m), [, b] = m.view().xRange;
        pos.setX(b); assert.equal(pos.u, 1); assert.equal(pos.x, Infinity);
        pos.setX(b - 0.3); assert.ok(Number.isFinite(pos.x) && pos.u < 1);
        m.setPreset('steps');
        pos.setX(m.view().xRange[1]); assert.equal(pos.u, 1); assert.ok(Number.isFinite(pos.x));
    });
    it('continuous: setX and setU are inverse', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m);
        pos.setU(0.3); const x = pos.x;
        pos.setX(x); assert.ok(Math.abs(pos.u - 0.3) < 1e-4);
    });
    it('the driver is kept across a model change', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(2.5);
        m.editPmf(0, 0.1); pos.refresh();
        assert.equal(pos.x, 2.5);
        assert.ok(Math.abs(pos.u - m.view().F[2]) < 1e-12);
        pos.setU(0.6);
        m.editPmf(0, 0.7); pos.refresh();
        assert.equal(pos.u, 0.6);
        assert.equal(pos.x, 1);                 // u = 0.6 now falls in atom 1's block
    });
    it('switching case keeps the position in range', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(7.9);
        m.setCase('cont'); pos.refresh();
        const [a, b] = m.view().xRange;
        // in range, or at +∞ with u = 1 (past the right edge of an unbounded support)
        assert.ok(pos.x >= a && (pos.x <= b || (pos.x === Infinity && pos.u === 1)) && pos.u >= 0 && pos.u <= 1);
    });
});

describe('position at the ends of the plotted range', () => {
    it('x at the right edge is u = 1 and at the left edge u = 0, for every continuous preset', () => {
        for (const key of ['gauss', 'bimodal', 'steps', 'uniform']) {
            const m = createModel(); m.setCase('cont'); m.setPreset(key);
            const pos = createPosition(m), [a, b] = m.view().xRange;
            pos.setX(b); assert.equal(pos.u, 1, key);
            pos.setX(a); assert.equal(pos.u, 0, key);
        }
    });
});
