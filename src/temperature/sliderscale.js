// ================================================================
//  Temperature scaling — sliderscale.js
//  Pure slider <-> temperature mappings (no DOM).
//
//  The slider axis is the inverse temperature beta = 1/T, increasing
//  left -> right and log-scaled in |beta| away from the snaps:
//
//  Positive-only mode:    [0 ······ 1 ······ ∞]          (beta)
//  Symlog mode:           [−∞ ··· −1 ··· 0 ··· 1 ··· ∞]  (beta)
//
//  The symlog axis is continuous in beta: the distribution morphs
//  smoothly through uniform (beta = 0) at the center, with no jump
//  anywhere. Snaps: endpoints (and center, in symlog mode) map to
//  the exact limits. Functions return T (model-side parameter);
//  beta = ∞ ⇔ T = 0 (argmax), beta = −∞ ⇔ T = −0 (argmin).
// ================================================================

import { T_MIN, T_MAX } from './config.js';

export const SLIDER_MAX = 1000;

// Interior |beta| range mirrors the temperature range (T_MIN = 1/T_MAX)
const LO = Math.log(1 / T_MAX);
const HI = Math.log(1 / T_MIN);

// fraction in [0,1] along the log scale of |beta|, and back
function betaToFrac(b) { return (Math.log(b) - LO) / (HI - LO); }
function fracToBeta(f) { return Math.exp(LO + (HI - LO) * f); }

const clamp01 = x => Math.max(0, Math.min(1, x));

export function sliderToT(v, negative) {
    if (!negative) {
        if (v <= 0) return Infinity;            // beta = 0  -> uniform
        if (v >= SLIDER_MAX) return 0;          // beta = ∞  -> argmax
        return 1 / fracToBeta(v / SLIDER_MAX);
    }
    const HALF = SLIDER_MAX / 2;
    if (v <= 0) return -0;                      // beta = −∞ -> argmin
    if (v >= SLIDER_MAX) return 0;              // beta = ∞  -> argmax
    if (v === HALF) return Infinity;            // beta = 0  -> uniform
    if (v > HALF) return 1 / fracToBeta((v - HALF) / HALF);
    return -1 / fracToBeta(1 - v / HALF);
}

export function tToSlider(t, negative) {
    if (!negative) {
        if (t === Infinity) return 0;
        if (t === 0) return SLIDER_MAX;
        return Math.round(SLIDER_MAX * clamp01(betaToFrac(1 / t)));
    }
    const HALF = SLIDER_MAX / 2;
    if (Object.is(t, -0)) return 0;
    if (t === 0) return SLIDER_MAX;
    if (t === Infinity || t === -Infinity) return HALF;
    if (t > 0) return Math.round(HALF + HALF * clamp01(betaToFrac(1 / t)));
    return Math.round(HALF * clamp01(1 - betaToFrac(-1 / t)));
}
