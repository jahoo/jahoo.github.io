// src/differential-entropy/fig-quantize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deltaLabel } from './fig-quantize.js';

describe('the Δ slider label', () => {
    it('is a fraction 1/2^k for a positive integer t, an integer for t ≤ 0, else 3 figures', () => {
        assert.equal(deltaLabel(2), '1/4');
        assert.equal(deltaLabel(0), '1');
        assert.equal(deltaLabel(-3), '8');
        assert.equal(deltaLabel(0.5), '0.707');
        assert.equal(deltaLabel(11.5), '3.45e-4');
    });
});
