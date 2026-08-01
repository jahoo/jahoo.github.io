// ================================================================
//  Anchored forward KL — config.js
//  Shared constants imported by the other modules.
// ================================================================

export const DEFAULT_K = 10;   // default number of elements
export const MIN_P = 0.002;    // floor for draggable probabilities

// Valid/invalid hues (valid blue shared with temperature's cold blue).
export const VALID_COLOR = 'rgb(41, 128, 185)';
export const INVALID_COLOR = 'rgb(192, 57, 43)';
export const NEUTRAL_COLOR = 'rgb(150, 156, 164)';

// Beta slider: log scale over [BETA_MIN, BETA_MAX] with snap endpoints
// at beta = 0 (posterior) and beta = infinity (prior).
export const BETA_MIN = 0.01;
export const BETA_MAX = 100;
export const DEFAULT_BETA = 0.5;

// Default prior for support size k: a smooth bump (normalized by the
// consumer).
export const defaultPrior = k => Array.from({ length: k }, (_, i) =>
    Math.exp(-((i - (k - 1) / 2) ** 2) / (2 * (k / 5) ** 2)));

// Default validity for support size k: an invalid band across the
// prior's mode, so conditioning visibly moves mass.
export function defaultValid(k) {
    const lo = Math.round(0.35 * k), hi = Math.round(0.65 * k);
    const v = Array.from({ length: k }, (_, i) => !(i >= lo && i < hi));
    if (v.every(Boolean)) v[k - 1] = false; // tiny k: keep the potential nontrivial
    return v;
}

// Default continuous potential for support size k: a smooth increasing
// ramp (sigmoid in the element index) spanning ~0.05 to ~0.95, so both
// the floor and the top compression of the softened potential show.
export const defaultPhi = k => Array.from({ length: k }, (_, i) => {
    const t = (i - (k - 1) / 2) / (k / 6);
    return 0.05 + 0.9 / (1 + Math.exp(-t));
});
