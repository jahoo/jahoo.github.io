// ================================================================
//  Resampling vs trained proposals — model.js
//  Pure math: bigram-prior Dyck toy. Twist psi*, optimal proposal,
//  training mixture q_s, analytic SIS variance. Port of the verified
//  Python simulator (finetuning-blob musings/dyck_resampling_toy.py).
//
//  Tokens: 0 = '<' (OPEN), 1 = '>' (CLOSE), 2 = '¤' (EOS).
//  Prior contexts: 0 = BOS, 1 = last '<', 2 = last '>'.
//  State classes for conditionals:
//    0 = start; 1 = (<, depth 0); 2 = (<, depth>=1);
//               3 = (>, depth 0); 4 = (>, depth>=1)
// ================================================================

export const OPEN = 0, CLOSE = 1, EOS = 2;
export const BOS = 0, LA = 1, LB = 2;
export const CTX_OF_CLS = [BOS, LA, LA, LB, LB];
export const D_CAP = 200;

export const UNIFORM = [
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
];

export const MEMORYLESS = [
    [0.4, 0.4, 0.2],
    [0.4, 0.4, 0.2],
    [0.4, 0.4, 0.2],
];

export const STICKY = [
    [0.40, 0.40, 0.20],
    [0.55, 0.25, 0.20],
    [0.25, 0.55, 0.20],
];

export function clsOf(phase, last, depth) {
    return phase === 0 ? 0 : 1 + 2 * last + (depth >= 1 ? 1 : 0);
}

// psi*[last in {0:'<', 1:'>'}][depth 0..D] by fixed point; Z; first-passage f.
export function twist(P, D = D_CAP) {
    let U = [new Float64Array(D + 2), new Float64Array(D + 2)];
    for (let iter = 0; iter < 200000; iter++) {
        const next = [new Float64Array(D + 2), new Float64Array(D + 2)];
        let delta = 0;
        for (const [li, ctx] of [[0, LA], [1, LB]]) {
            next[li][0] = P[ctx][EOS] + P[ctx][OPEN] * U[0][1];
            for (let d = 1; d <= D; d++) {
                next[li][d] = P[ctx][OPEN] * U[0][d + 1] + P[ctx][CLOSE] * U[1][d - 1];
            }
            for (let d = 0; d <= D; d++) delta = Math.max(delta, Math.abs(next[li][d] - U[li][d]));
        }
        U = next;
        if (delta < 1e-15) break;
    }
    const Z = P[BOS][OPEN] * U[0][1];
    // closed form: product f_< f_> solves a scalar quadratic
    const a2 = P[LA][OPEN] * P[LB][OPEN];
    const a1 = P[LA][OPEN] * P[LB][CLOSE] + P[LB][OPEN] * P[LA][CLOSE] - 1;
    const a0 = P[LA][CLOSE] * P[LB][CLOSE];
    const Q = a2 > 0 ? (-a1 - Math.sqrt(a1 * a1 - 4 * a2 * a0)) / (2 * a2) : a0 / (-a1);
    const f = [P[LA][CLOSE] + P[LA][OPEN] * Q, P[LB][CLOSE] + P[LB][OPEN] * Q];
    return { U, Z, f };
}

// Optimal proposal over the 5 state classes.
export function qstarTable(P, U) {
    const q = [];
    q[0] = normalizeRow([P[BOS][OPEN] * U[0][1], 0, 0]);
    for (const [li, ctx] of [[0, LA], [1, LB]]) {
        q[1 + 2 * li] = normalizeRow([P[ctx][OPEN] * U[0][1], 0, P[ctx][EOS]]);
        q[2 + 2 * li] = normalizeRow([P[ctx][OPEN] * U[0][2], P[ctx][CLOSE] * U[1][0], 0]);
    }
    return q;
}

function normalizeRow(r) {
    const s = r[0] + r[1] + r[2];
    return s > 0 ? [r[0] / s, r[1] / s, r[2] / s] : [0, 0, 0];
}

// Training-trajectory proposal q_s = (1-s) p0 + s q*, per state class (5x3),
// plus everything downstream needs.
export function qMix(P, s) {
    const { U, Z, f } = twist(P);
    const p0cls = CTX_OF_CLS.map(ctx => P[ctx].slice());
    const qs = qstarTable(P, U);
    const q = p0cls.map((row, c) => row.map((p, t) => (1 - s) * p + s * qs[c][t]));
    return { q, p0cls, U, Z, f, qstar: qs };
}

// Exact E[w^k] under proposal table q via DP -> analytic SIS relstd for M particles.
export function analyticSis(P, q, D = D_CAP) {
    const p0cls = CTX_OF_CLS.map(ctx => P[ctx]);
    const out = [];
    for (const k of [1, 2]) {
        let m = [new Float64Array(D + 2), new Float64Array(D + 2)];
        for (let iter = 0; iter < 200000; iter++) {
            const next = [new Float64Array(D + 2), new Float64Array(D + 2)];
            let delta = 0;
            for (const li of [0, 1]) {
                const c0 = 1 + 2 * li, c1 = 2 + 2 * li;
                let t = 0;
                if (q[c0][OPEN] > 0) t += q[c0][OPEN] * Math.pow(p0cls[c0][OPEN] / q[c0][OPEN], k) * m[0][1];
                if (q[c0][EOS] > 0) t += q[c0][EOS] * Math.pow(p0cls[c0][EOS] / q[c0][EOS], k);
                next[li][0] = t;
                const a = q[c1][OPEN] > 0 ? q[c1][OPEN] * Math.pow(p0cls[c1][OPEN] / q[c1][OPEN], k) : 0;
                const b = q[c1][CLOSE] > 0 ? q[c1][CLOSE] * Math.pow(p0cls[c1][CLOSE] / q[c1][CLOSE], k) : 0;
                for (let d = 1; d <= D; d++) next[li][d] = a * m[0][d + 1] + b * m[1][d - 1];
                for (let d = 0; d <= D; d++) delta = Math.max(delta, Math.abs(next[li][d] - m[li][d]));
            }
            m = next;
            if (delta < 1e-16) break;
        }
        out.push(q[0][OPEN] > 0 ? q[0][OPEN] * Math.pow(p0cls[0][OPEN] / q[0][OPEN], k) * m[0][1] : 0);
    }
    return { Z: out[0], m2: out[1] };
}

export function analyticSisRelstd(P, s, M) {
    const { q } = qMix(P, s);
    const { m2 } = analyticSis(P, q);
    const Z = twist(P).Z;
    const relvar = Math.max(0, (m2 - Z * Z) / (Z * Z) / M);
    return Math.sqrt(relvar);
}

// Row-normalize a user-edited 3x3 prior; clamp away degenerate corners.
export function sanitizePrior(P, minP = 0.02) {
    return P.map(row => {
        const r = row.map(x => Math.max(minP, Math.min(1, Number(x) || 0)));
        const s = r[0] + r[1] + r[2];
        return r.map(x => x / s);
    });
}
