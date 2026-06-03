// ================================================================
//  Temperature scaling — model.js
//  Pure math, no DOM. Kept framework-free so the same functions
//  can drive the later sequential-LM figures.
// ================================================================

// Return a new array rescaled to sum to 1.
export function normalize(arr) {
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map(v => v / s);
}

// True for T < 0 and for the -0 and -Infinity limits (note -0 < 0 is
// false in JS, hence the Object.is check).
export function isNegativeTemp(T) {
    return T < 0 || Object.is(T, -0);
}

// Temperature-scale a discrete distribution: p_T(i) ∝ p(i)^(1/T).
// Computed in log space for numerical stability. Limit cases:
//   T = 0          → uniform over the argmax(es)
//   T = ±Infinity  → uniform over the support (nonzero entries)
//   T = -0         → uniform over the argmin(s) of the support
// Negative T reverses the ordering (the exponent 1/T flips sign).
// Zeros are excluded from tempering and stay zero at every temperature
// (0^(1/T) diverges for T < 0, so we temper over the support only).
// Returns a new array.
export function temper(p, T) {
    if (Object.is(T, -0)) {
        const min = Math.min(...p.filter(v => v > 0));
        return normalize(p.map(v => (v === min ? 1 : 0)));
    }
    if (T === 0) {
        const max = Math.max(...p);
        return normalize(p.map(v => (v === max ? 1 : 0)));
    }
    if (T === Infinity || T === -Infinity) {
        return normalize(p.map(v => (v > 0 ? 1 : 0)));
    }
    // -Infinity marks zeros: exp(-Inf - m) = 0, so they drop out cleanly
    // under either sign of T.
    const logp = p.map(v => (v > 0 ? Math.log(v) / T : -Infinity));
    const m = Math.max(...logp.filter(Number.isFinite));
    return normalize(logp.map(l => Math.exp(l - m)));
}
