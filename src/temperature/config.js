// ================================================================
//  Temperature scaling — config.js
//  Shared constants imported by the other modules.
// ================================================================

export const K = 8;            // number of elements
export const MIN_P = 0.01;     // floor for draggable probabilities (keeps logs finite)

// Finite |T| range of the slider's log scale. Reciprocals of each other,
// so T = 1 falls exactly mid-range.
export const T_MIN = 0.05;
export const T_MAX = 20;

// Display floor for the log-probability panels (natural log).
// Values below this are clamped and marked.
export const LOG_FLOOR = -9;

// Base distribution: understated gray (same spirit as smc-resampling).
export const BASE_COLOR = 'rgb(150, 156, 164)';

// Tempered distribution: tinted by temperature, cold blue -> neutral -> hot orange.
export const COLD_RGB = [41, 128, 185];
export const NEUTRAL_RGB = [150, 156, 164];
export const HOT_RGB = [224, 102, 46];
// Negative temperatures get their own (weird) hue.
export const VIOLET_RGB = [142, 68, 173];

// Presets for the base distribution (normalized by the consumer).
export const PRESETS = {
    unimodal: [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05],
    uniform:  [1, 1, 1, 1, 1, 1, 1, 1],
    peaked:   [0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03],
    bimodal:  [0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15],
    zipf:     [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8],
};
