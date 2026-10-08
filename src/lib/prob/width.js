// ================================================================
//  Probability figures — width.js
//  Entropy as a size. 2^H is the effective number of outcomes of a
//  pmf and 2^h the effective width of a density: the uniform with the
//  same entropy has that many outcomes, or that length. Pure: no DOM.
// ================================================================

import { log2, runningIntegral, shapeMoments } from './dist.js';

// H(X) for a pmf, h(X) for a density, in bits. The density's is the total of the area
// figure's integrand −log p_X over u, by the same trapezoid sum along the samples, so
// every figure quotes the same number.
export function entropyOf(v) {
    if (v.disc) return v.p.reduce((t, q) => t - (q > 0 ? q * log2(q) : 0), 0);
    return runningIntegral(v.S.Fs, v.S.fs.map(f => -log2(f))).at(-1);
}

// The atoms' positions: 1..n, or the ones the view carries.
export const positionsOf = v => v.xs ?? v.p.map((_, i) => i + 1);

// The mean of X.
export function meanOf(v) {
    if (!v.disc) return shapeMoments(v.shape).mean;
    const xs = positionsOf(v);
    return v.p.reduce((t, q, i) => t + q * xs[i], 0);
}

// The uniform with the same entropy, as a box of area 1 centred on the mean: { H, cx, w, ht }.
// A pmf's box is 2^H atom slots wide (a slot is the atoms' spacing) and 2^-H high; a
// density's is 2^h long and 2^-h high.
export function boxOf(v) {
    const H = entropyOf(v), cx = meanOf(v);
    if (!v.disc) return { H, cx, w: 2 ** H, ht: 2 ** -H };
    const xs = positionsOf(v), slot = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { H, cx, w: 2 ** H * slot, ht: 2 ** -H };
}
