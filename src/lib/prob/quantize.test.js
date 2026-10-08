// src/lib/prob/quantize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shannonH, temper } from './dist.js';
import { createModel } from './model.js';
import { entropyOf } from './width.js';
import { view, near } from './test-util.js';
import { binMasses, quantizedH, quantizeCurve } from './quantize.js';

describe('X quantized to bins of width Δ', () => {
    it('a pmf is flat at H(X) for every Δ below 1, and 0 once one bin holds everything', () => {
        const v = view('disc', 'zipf'), H = shannonH(v.p);
        for (const D of [1, 0.5, 1 / 16]) near(quantizedH(v, D), H, 1e-12, `Δ = ${D}`);
        near(quantizedH(v, 16), 0, 1e-12);
    });
    it("a pmf's bins start at 0.5: Δ = 1 puts each atom alone in its own bin", () => {
        const { edges, masses } = binMasses(view('disc', 'zipf'), 1);
        assert.deepEqual(edges, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]);
        assert.equal(masses.length, 8);
    });
    it('a tempered view quantizes its tempered pmf, not the base', () => {
        const m = createModel(); m.setPreset('zipf'); m.setBeta(0);
        const v = m.view(); // uniform on the support; base = zipf
        assert.ok(v.base);
        near(quantizedH(v, 1), 3, 1e-12); // 8 equal atoms
        near(quantizedH(v, 1), shannonH(temper(m.p, 0)), 1e-12);
        assert.ok(Math.abs(quantizedH(v, 1) - shannonH(v.base)) > 0.1);
    });
    it('for the Gaussian preset, H(X_Δ) + log Δ is within 0.05 of h at Δ = 2⁻⁸, and halving Δ adds a bit', () => {
        const v = view('cont', 'gauss'), h = entropyOf(v);
        near(quantizedH(v, 2 ** -8) - 8, h, 0.05);
        near(quantizedH(v, 2 ** -9) - quantizedH(v, 2 ** -8), 1, 0.02);
    });
    it('the uniform density of width 0.7 cut into 4 bins from its left edge has 2 bits', () => {
        near(quantizedH(view('cont', 'uniform'), 0.7 / 4, -0.35), 2, 1e-6);
    });
    it('the curve is H(X_Δ) at Δ = 2^-t, and the bin masses sum to 1', () => {
        const v = view('cont', 'bimodal');
        near(binMasses(v, 0.25).masses.reduce((a, b) => a + b, 0), 1, 1e-6);
        assert.deepEqual(quantizeCurve(v, [0, 2]), [quantizedH(v, 1), quantizedH(v, 0.25)]);
    });
});
