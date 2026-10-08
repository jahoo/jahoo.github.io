// src/lib/prob/width.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { entropyOf, meanOf, boxOf } from './width.js';

export const view = (kase, key) => { const m = createModel(); m.setCase(kase); m.setPreset(key); return m.view(); };
export const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) < tol, `${msg} ${a} vs ${b} (tol ${tol})`);

describe('entropy as a size', () => {
    it('the uniform pmf on 8 outcomes has 2^H = 8: a box 8 slots wide, 1/8 high, centred at 4.5', () => {
        const b = boxOf(view('disc', 'uniform'));
        near(b.H, 3, 1e-12); near(b.w, 8, 1e-9); near(b.ht, 1 / 8, 1e-12); near(b.cx, 4.5, 1e-12);
    });
    it('the one-hot pmf has a box of one slot, height 1, on its atom', () => {
        const b = boxOf(view('disc', 'onehot'));
        near(b.H, 0, 1e-12); near(b.w, 1, 1e-12); near(b.ht, 1, 1e-12); near(b.cx, 3, 1e-12);
    });
    it('the uniform density of width 0.7 has 2^h = 0.7: a box as wide as its support', () => {
        const b = boxOf(view('cont', 'uniform'));
        near(b.w, 0.7, 1e-3); near(b.cx, 0, 1e-9); near(b.w * b.ht, 1, 1e-12);
    });
    it('the Gaussian preset (σ = 0.2) has h = ½ log(2πe σ²): negative, with a width below 1', () => {
        const v = view('cont', 'gauss'), h = 0.5 * Math.log2(2 * Math.PI * Math.E * 0.04);
        near(entropyOf(v), h, 0.01);
        assert.ok(entropyOf(v) < 0);
        assert.ok(boxOf(v).w < 1);
    });
    it('a pmf carried on explicit positions takes its mean and its slot from them', () => {
        const v = view('disc', 'uniform'), s = { ...v, xs: v.p.map((_, i) => 2 * (i + 1)) };
        near(meanOf(s), 9, 1e-12); near(boxOf(s).w, 16, 1e-9); near(boxOf(s).ht, 1 / 8, 1e-12);
    });
});
