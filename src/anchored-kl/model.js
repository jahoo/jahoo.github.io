// ================================================================
//  Anchored forward KL — model.js
//  Pure math, no DOM. The anchored objective is
//      L_beta(q) = KL(pi || q) + beta * KL(q || p),
//  with pi = p conditioned on the valid set V (binary potential).
//  Its minimizer is q* ∝ p · max{φ, eps} with
//      eps = exp(-1/(alpha*beta)),  alpha = q*(V) = Z / (Z + eps(1-Z)),
//  the unique fixed point of the displayed pair (Z = p(V)).
// ================================================================

import { MIN_P } from './config.js';

// Return a new array rescaled to sum to 1.
export function normalize(arr) {
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map(v => v / s);
}

// Set probs[i] to target, rescaling the others to keep the sum at 1.
// probs must sum to 1 on entry. Returns a new array.
export function withProb(probs, i, target) {
    target = Math.max(MIN_P, Math.min(1 - (probs.length - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - probs[i]);
    return normalize(probs.map((p, j) =>
        j === i ? target : Math.max(MIN_P, p * scale)));
}

// x * log(x / y), continuously extended to x = 0.
const xlogx = (x, y) => (x === 0 ? 0 : x * Math.log(x / y));

// KL between Bernoulli(a) and Bernoulli(Z) — d(a || Z) in the post.
export function bernKL(a, Z) {
    return xlogx(a, Z) + xlogx(1 - a, 1 - Z);
}

// d/da of bernKL(a, Z): the log odds ratio, strictly increasing on (0, 1).
export function bernKLPrime(a, Z) {
    return Math.log((a * (1 - Z)) / (Z * (1 - a)));
}

// The reduced objective f(a) = log(1/a) + beta * d(a || Z): the value of
// L_beta at the segment point with weight a (finite beta only).
export function fOfAlpha(Z, beta, a) {
    return -Math.log(a) + beta * bernKL(a, Z);
}

// f'(a) = -1/a + beta * log( a(1-Z) / (Z(1-a)) ), strictly increasing on
// (0, 1); its unique root is alpha_beta (NaN at a = 1 when beta = 0 —
// callers stay strictly inside the interval).
export function fPrimeOfAlpha(Z, beta, a) {
    return -1 / a + beta * Math.log((a * (1 - Z)) / (Z * (1 - a)));
}

// Solve alpha = Z / (Z + exp(-1/(alpha*beta)) * (1-Z)) for alpha in [Z, 1].
// The right-hand side is continuous and strictly decreasing in alpha, and
// crosses the identity exactly once on (Z, 1): bisection.
export function solveAlpha(Z, beta) {
    if (Z >= 1) return 1;
    if (Z <= 0) return 0;
    if (beta === 0) return 1;
    if (beta === Infinity) return Z;
    const g = a => Z / (Z + Math.exp(-1 / (a * beta)) * (1 - Z));
    let lo = Z, hi = 1;
    for (let it = 0; it < 100; it++) {
        const mid = (lo + hi) / 2;
        if (g(mid) > mid) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// Invert alpha_beta: the beta whose anchored optimum puts mass alpha on
// the valid set (for Z < alpha < 1). From the fixed point,
//     1/(alpha*beta) = log( alpha(1-Z) / (Z(1-alpha)) ).
export function betaOfAlpha(Z, alpha) {
    if (alpha >= 1) return 0;
    if (alpha <= Z) return Infinity;
    return 1 / (alpha * Math.log((alpha * (1 - Z)) / (Z * (1 - alpha))));
}

// The floor eps_beta = exp(-1/(alpha*beta)): the invalid-set level of
// q*/p relative to the valid-set level.
export function epsBeta(alpha, beta) {
    if (beta === Infinity) return 1;
    return Math.exp(-1 / (alpha * beta)); // beta = 0 gives exp(-Inf) = 0
}

// The anchored optimum for prior p (any positive array), boolean validity
// mask, and beta in [0, Infinity]. Returns { q, alpha, eps, Z }.
// Degenerate masks: all-valid means no constraint (q* = p = pi); all-invalid
// leaves the posterior undefined — callers should prevent it, but we return
// the prior so the display stays sane.
export function anchoredOptimum(prior, valid, beta) {
    const p = normalize(prior);
    const Z = p.reduce((s, v, i) => s + (valid[i] ? v : 0), 0);
    if (Z <= 0) return { q: p, alpha: 0, eps: 1, Z: 0 };
    if (Z >= 1) return { q: p, alpha: 1, eps: 1, Z: 1 };
    const alpha = solveAlpha(Z, beta);
    const eps = epsBeta(alpha, beta);
    const q = normalize(p.map((v, i) => v * (valid[i] ? 1 : eps)));
    return { q, alpha, eps, Z };
}

// --- Continuous potential ---
// Stationarity of the anchored objective gives, per element, with
// r = q*/p and one global constant c fixed by normalization:
//     phi = Z * r * (beta*log r + c)  =: g(r),
// on the increasing branch r >= exp(-c/beta) (where g = 0). So the
// optimum is q* = p * gInverse(phi): elements enter only through their
// potential value, via one monotone reshaping curve.

// Solve g(r) = phi for r on the increasing branch: bisection with an
// expanding upper bracket (g is strictly increasing there).
function rOfPhiAt(phi, Z, beta, c) {
    const r0 = Math.exp(-c / beta); // g(r0) = 0
    if (phi <= 0) return r0;
    const g = r => Z * r * (beta * Math.log(r) + c);
    let hi = Math.max(r0 * 2, 1);
    while (g(hi) < phi) hi *= 2;
    let lo = r0;
    for (let it = 0; it < 56; it++) {
        const mid = (lo + hi) / 2;
        if (g(mid) < phi) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// The anchored optimum for a continuous potential phi (values in [0, 1])
// and beta in [0, Infinity]. Returns { q, rOf, softened, c, eps, Z }:
// q the normalized optimum, rOf the ratio curve gInverse on [0, 1],
// softened(x) = rOf(x)/rOf(1) the displayed softened potential (so
// softened(0) = eps generalizes the binary floor), c the multiplier.
// Total mass sum p_i * r_i(c) is strictly decreasing in c, so the outer
// bisection on c is well posed; brackets are found by doubling steps.
export function contOptimum(prior, phi, beta) {
    const p = normalize(prior);
    const Z = p.reduce((s, v, i) => s + v * phi[i], 0);
    const flat = { rOf: () => 1, softened: () => 1, c: NaN, eps: 1, Z };
    if (Z <= 0) return { q: p.slice(), ...flat };           // no valid mass
    if (beta === Infinity) return { q: p.slice(), ...flat }; // the prior
    if (beta === 0) {
        // the exact posterior; r is linear in phi
        return {
            q: normalize(p.map((v, i) => v * phi[i])),
            rOf: x => x / Z,
            softened: x => x,
            c: NaN, eps: 0, Z,
        };
    }
    const T = c => p.reduce((s, v, i) => s + v * rOfPhiAt(phi[i], Z, beta, c), 0);
    let cLo = 0, cHi = 0, step = 1;
    while (T(cLo) < 1) { cLo -= step; step *= 2; }
    step = 1;
    while (T(cHi) > 1) { cHi += step; step *= 2; }
    for (let it = 0; it < 56; it++) {
        const mid = (cLo + cHi) / 2;
        if (T(mid) > 1) cLo = mid; else cHi = mid;
    }
    const c = (cLo + cHi) / 2;
    const rOf = x => rOfPhiAt(x, Z, beta, c);
    const r1 = rOf(1);
    const softened = x => rOf(x) / r1;
    return {
        q: normalize(p.map((v, i) => v * rOf(phi[i]))), // tidy bisection residue
        rOf, softened, c, eps: softened(0), Z,
    };
}
