import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, tf, fmt } from './region.js';

describe('region helpers', () => {
    it('niceTicks picks 1-2-5 steps inside the range', () => {
        assert.deepEqual(niceTicks(0, 1, 4), [0, 0.2, 0.4, 0.6, 0.8, 1]);
        assert.deepEqual(niceTicks(-0.85, 0.85, 6), [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]);
    });
    it('tf and fmt use a typographic minus and no −0', () => {
        assert.equal(tf(-0.25), '−0.25');
        assert.equal(tf(1e-12), '0');
        assert.equal(fmt(-0.0001, 3), '0.000');
        assert.equal(fmt(-1.5, 2), '−1.50');
        assert.equal(fmt(Infinity), '∞');
    });
});
