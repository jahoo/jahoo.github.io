import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutWidth } from './fit.js';

describe('layoutWidth', () => {
    it('is the full 1000 units wherever the figure has 640px or more', () => {
        assert.equal(layoutWidth(1100), 1000);
        assert.equal(layoutWidth(640), 1000);
    });
    it('narrower, the layout narrows so it draws at the phone scale, down to a floor', () => {
        assert.equal(layoutWidth(320), 500);
        assert.equal(layoutWidth(200), 460);
    });
});
