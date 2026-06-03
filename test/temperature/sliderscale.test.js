import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sliderToT, tToSlider, SLIDER_MAX } from '../../src/temperature/sliderscale.js';
import { T_MIN, T_MAX } from '../../src/temperature/config.js';

// The slider axis is beta = 1/T, increasing left -> right.

describe('sliderToT, positive-only mode (beta in [0, ∞])', () => {
    it('snaps the left end to beta = 0, i.e. T = Infinity (uniform)', () => {
        assert.equal(sliderToT(0, false), Infinity);
    });

    it('snaps the right end to beta = ∞, i.e. T = 0 (argmax)', () => {
        assert.ok(Object.is(sliderToT(SLIDER_MAX, false), 0));
    });

    it('maps the center to T = 1', () => {
        assert.ok(Math.abs(sliderToT(SLIDER_MAX / 2, false) - 1) < 1e-12);
    });

    it('maps the interior onto [T_MAX, T_MIN] (beta rising)', () => {
        assert.ok(Math.abs(sliderToT(1, false) - T_MAX) < 0.2);
        assert.ok(Math.abs(sliderToT(SLIDER_MAX - 1, false) - T_MIN) < 0.01);
    });

    it('is strictly increasing in beta', () => {
        let prev = 0;
        for (let v = 100; v < SLIDER_MAX; v += 100) {
            const beta = 1 / sliderToT(v, false);
            assert.ok(beta > prev, `v=${v}`);
            prev = beta;
        }
    });
});

describe('sliderToT, symlog mode (beta in [−∞, ∞])', () => {
    it('snaps the left end to beta = −∞, i.e. T = -0 (argmin)', () => {
        assert.ok(Object.is(sliderToT(0, true), -0));
    });

    it('snaps the center to beta = 0, i.e. T = Infinity (uniform)', () => {
        assert.equal(sliderToT(SLIDER_MAX / 2, true), Infinity);
    });

    it('snaps the right end to beta = ∞, i.e. T = 0 (argmax)', () => {
        assert.ok(Object.is(sliderToT(SLIDER_MAX, true), 0));
    });

    it('maps the left-quarter point to T = -1', () => {
        assert.ok(Math.abs(sliderToT(SLIDER_MAX / 4, true) - (-1)) < 1e-12);
    });

    it('maps the right-quarter point to T = 1', () => {
        assert.ok(Math.abs(sliderToT((3 * SLIDER_MAX) / 4, true) - 1) < 1e-12);
    });

    it('is negative left of center, positive right of center', () => {
        assert.ok(sliderToT(SLIDER_MAX / 2 - 1, true) < 0);
        assert.ok(sliderToT(SLIDER_MAX / 2 + 1, true) > 0);
    });

    it('approaches the center symmetrically in |T|', () => {
        const left = sliderToT(SLIDER_MAX / 2 - 50, true);
        const right = sliderToT(SLIDER_MAX / 2 + 50, true);
        assert.ok(Math.abs(-left - right) < 1e-9);
    });

    it('is monotone increasing in beta across the whole axis', () => {
        let prevBeta = -Infinity;
        for (let v = 1; v < SLIDER_MAX; v += 50) {
            const t = sliderToT(v, true);
            const beta = 1 / t; // 1/-0 = -Infinity, 1/Infinity = 0
            assert.ok(beta > prevBeta, `v=${v}: beta ${beta} !> ${prevBeta}`);
            prevBeta = beta;
        }
    });
});

describe('tToSlider (inverse mapping)', () => {
    it('round-trips slider positions in positive-only mode', () => {
        for (const v of [0, 100, 250, 500, 750, 900, SLIDER_MAX]) {
            assert.equal(tToSlider(sliderToT(v, false), false), v, `v=${v}`);
        }
    });

    it('round-trips slider positions in symlog mode', () => {
        for (const v of [0, 100, 250, 500, 600, 750, 900, SLIDER_MAX]) {
            assert.equal(tToSlider(sliderToT(v, true), true), v, `v=${v}`);
        }
    });

    it('maps the same positive T consistently across modes', () => {
        // T = 1 (beta = 1): center when positive-only, right-quarter under symlog
        assert.equal(tToSlider(1, false), SLIDER_MAX / 2);
        assert.equal(tToSlider(1, true), (3 * SLIDER_MAX) / 4);
    });

    it('places special values at their snaps', () => {
        assert.equal(tToSlider(-0, true), 0);
        assert.equal(tToSlider(Infinity, true), SLIDER_MAX / 2);
        assert.equal(tToSlider(-Infinity, true), SLIDER_MAX / 2);
        assert.equal(tToSlider(0, true), SLIDER_MAX);
    });

    it('clamps out-of-range magnitudes into the track', () => {
        // |T| beyond T_MAX means beta near 0: lands by the uniform center
        const v = tToSlider(1000, true);
        assert.ok(v >= SLIDER_MAX / 2 && v < SLIDER_MAX);
        const vn = tToSlider(-1000, true);
        assert.ok(vn > 0 && vn <= SLIDER_MAX / 2);
    });
});
