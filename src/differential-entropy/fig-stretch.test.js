// src/differential-entropy/fig-stretch.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stretchLabel } from './fig-stretch.js';

describe('the stretch slider label', () => {
    it('is an integer for s ≥ 0 integer, 1/2^k for a negative integer s, else 3 figures', () => {
        assert.equal(stretchLabel(0), '1');
        assert.equal(stretchLabel(3), '8');
        assert.equal(stretchLabel(-2), '1/4');
        assert.equal(stretchLabel(0.5), '1.41');
        assert.equal(stretchLabel(-0.5), '0.71');
    });
});
