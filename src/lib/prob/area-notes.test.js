import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NOTES } from './area-notes.js';

describe('area figure notes', () => {
    it('both variants define the same keys, with the same kinds of values', () => {
        const a = NOTES.expectation, b = NOTES.entropy;
        assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
        for (const k of Object.keys(a)) assert.equal(typeof a[k], typeof b[k], k);
    });
    it('the expectation variant is the wording the expectation post shipped with', () => {
        const T = NOTES.expectation;
        assert.equal(T.dist, 'The distribution of \\(X\\): what the expectation averages over.');
        assert.equal(T.g, 'The function \\(g\\) gives the height to integrate.');
        assert.equal(T.area(true, '1'), 'The expectation is the whole area:');
        assert.equal(T.area(false, '0.600'), 'The area up to \\(u = \\class{ex-now}{0.600}\\) is:');
        assert.equal(T.rest, 'The expectation is the whole area (slide \\(u\\) to 1).');
        assert.equal(T.gLabel('-\\log_2 p_X(x)'), 'g(x) = -\\log_2 p_X(x)');
        assert.equal(T.gLabel(null), 'g(x)');
        assert.equal(T.aLabel('-\\log_2 p_X(x)'), 'g(F_X^{-1}(u))');
        assert.equal(T.avg(true), '\\mathbb{E}[g(X)]');
        assert.equal(T.integrand('-\\log_2 p_X(x)'), 'g\\big(F_X^{-1}(v)\\big)');
        assert.equal(T.result({ mn: { tex: 'H(X)', name: 'entropy' }, val: '2.310', unit: '\\text{ bits}', disc: true }),
            '\\mathbb{E}[g(X)] \\;=\\; \\underbrace{H(X)}_{\\mathclap{\\text{entropy}}} \\;=\\; 2.310\\text{ bits}');
        assert.equal(T.result({ mn: null, val: '1.5', unit: '', disc: true }), '\\mathbb{E}[g(X)] \\;=\\; 1.5');
    });
    it('the entropy variant names the entropy, with H for a pmf and h for a density', () => {
        const T = NOTES.entropy;
        assert.equal(T.dist, 'The distribution of \\(X\\): what the entropy averages over.');
        assert.equal(T.map, NOTES.expectation.map);
        assert.equal(T.g, 'The height is the surprisal, \\(-\\log_2 p_X(x)\\).');
        assert.equal(T.area(true, '1'), 'The entropy is the whole area:');
        assert.equal(T.gLabel('-\\log_2 p_X(x)'), '-\\log_2 p_X(x)');
        assert.equal(T.aLabel('-\\log_2 p_X(x)'), '-\\log_2 p_X(F_X^{-1}(u))');
        assert.equal(T.avg(true), 'H(X)');
        assert.equal(T.avg(false), 'h(X)');
        assert.equal(T.integrand('-\\log_2 p_X(x)'), '-\\log_2 p_X\\big(F_X^{-1}(v)\\big)');
        assert.equal(T.result({ mn: null, val: '2.310', unit: '\\text{ bits}', disc: true }), 'H(X) \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; 2.310\\text{ bits}');
        assert.equal(T.result({ mn: null, val: '\\class{ex-neg}{-0.420}', unit: '\\text{ bits}', disc: false }), 'h(X) \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; \\class{ex-neg}{-0.420}\\text{ bits}');
    });
});
