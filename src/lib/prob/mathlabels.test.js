import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { texNum } from './mathlabels.js';

describe('texNum', () => {
    it('writes numbers for TeX: ASCII minus, fixed decimals, no −0', () => {
        assert.equal(texNum(-0.2349), '-0.235');
        assert.equal(texNum(2.1344, 3), '2.134');
        assert.equal(texNum(-0.0001, 3), '0.000');
        assert.equal(texNum(Infinity), '\\infty');
    });
});
