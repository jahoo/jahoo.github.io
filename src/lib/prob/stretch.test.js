// src/lib/prob/stretch.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entropyOf } from './width.js';
import { view, near } from './test-util.js';
import { stretchView, randomPerm } from './stretch.js';

// a small deterministic generator, so the permutation tests are repeatable
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('Y = aX', () => {
    it('randomPerm is a permutation of 0..n-1', () => {
        assert.deepEqual([...randomPerm(8, lcg(1))].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
    });
    it('a permutation of the atoms leaves H unchanged and moves the probabilities', () => {
        const v = view('disc', 'zipf'), perm = randomPerm(8, lcg(7)), s = stretchView(v, 1, perm);
        near(entropyOf(s), entropyOf(v), 1e-12);
        assert.deepEqual([...s.p].sort(), [...v.p].sort());
        perm.forEach((j, i) => assert.equal(s.p[j], v.p[i]));
        assert.deepEqual(s.xs, [1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it('a permutation carries an atom without mass to its new slot', () => {
        const v = view('disc', 'onehot'), s = stretchView(v, 1, [7, 6, 5, 4, 3, 2, 1, 0]);
        assert.deepEqual(s.p, [0, 0, 0, 0, 0, 1, 0, 0]); // the atom at x = 3 (index 2) lands at index 5
        near(entropyOf(s), 0, 1e-12);
    });
    it('stretching atoms by a moves them to a·k and keeps every probability', () => {
        const v = view('disc', 'zipf'), s = stretchView(v, 2);
        assert.deepEqual(s.p, v.p);
        assert.deepEqual(s.xs, [2, 4, 6, 8, 10, 12, 14, 16]);
        assert.deepEqual(s.xRange, [1, 17]);
        near(entropyOf(s), entropyOf(v), 1e-12);
    });
    it('stretching a density by a adds log a to h', () => {
        const v = view('cont', 'gauss'), h = entropyOf(v);
        for (const a of [1 / 8, 1 / 4, 3]) near(entropyOf(stretchView(v, a)) - h, Math.log2(a), 0.02, `a = ${a}`);
    });
    it('a = 1 with no permutation is the same distribution', () => {
        const v = view('cont', 'bimodal'), s = stretchView(v, 1);
        near(entropyOf(s), entropyOf(v), 1e-9);
        assert.deepEqual(s.xRange, v.xRange);
        near(s.win.y1, v.win.y1, 1e-12);
    });
});
