// ================================================================
//  Probability figures — quantize.js
//  X quantized to bins of width Δ: the bin masses and the Shannon
//  entropy H(X_Δ). A density's bin grid starts at 0; a pmf's at 0.5,
//  so Δ = 1 is one atom per bin and every Δ < 1 isolates every atom.
//  Pure: no DOM.
// ================================================================

import { gMass, shannonH, stepsDist } from './dist.js';

// The interval to cover: the atoms, a steps shape's ends, or ±9σ of each Gaussian component.
function extent(v) {
    if (v.disc) return [1, v.p.length];
    const s = v.shape;
    if (s.kind === 'steps') return [s.ts[0], s.ts[s.ts.length - 1]];
    return [Math.min(...s.comps.map(c => c.m - 9 * c.s)), Math.max(...s.comps.map(c => c.m + 9 * c.s))];
}

// P(a ≤ X ≤ b) for a density.
function massFn(s) {
    if (s.kind === 'steps') return stepsDist(s.ts, s.ms).mass;
    return (a, b) => s.comps.reduce((t, c) => t + c.w * gMass(a, b, c.m, c.s), 0);
}

// Bins of width D on the grid origin + kD, over the support: { edges, masses }.
export function binMasses(v, D, origin = v.disc ? 0.5 : 0) {
    const [lo, hi] = extent(v);
    const bin = x => Math.floor((x - origin) / D + 1e-9);
    const k0 = bin(lo), k1 = bin(hi);
    const masses = new Array(k1 - k0 + 1).fill(0);
    if (v.disc) v.p.forEach((q, i) => { masses[bin(i + 1) - k0] += q; });
    else {
        const mass = massFn(v.shape);
        for (let k = k0; k <= k1; k++) masses[k - k0] = mass(origin + k * D, origin + (k + 1) * D);
    }
    const edges = masses.map((_, j) => origin + (k0 + j) * D);
    edges.push(origin + (k1 + 1) * D);
    return { edges, masses };
}

// H(X_Δ) in bits.
export function quantizedH(v, D, origin) {
    return shannonH(binMasses(v, D, origin).masses);
}

// H(X_Δ) at Δ = 2^-t, for each t.
export function quantizeCurve(v, ts) {
    return ts.map(t => quantizedH(v, 2 ** -t));
}
