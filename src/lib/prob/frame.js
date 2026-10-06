// ================================================================
//  Probability figures — frame.js
//  Everything the figures and readouts share for the current
//  position: the function g, its values, the area accumulated up
//  to u, and the total E[g(X)]. Pure: no DOM.
// ================================================================

import { log2, atX, atU, lerp, runningIntegral } from './dist.js';

// The function being averaged, given the outcome x, its probability (or density) v,
// and the mean m and standard deviation s of X; and what its expectation is, in each case.
export const G = {
    neglog: {
        f: (x, v) => -log2(v), tex: '-\\log_2 p_X(x)', clip: [-5, 9], unit: '\\text{ bits}',
        means: disc => (disc ? { tex: 'H(X)', name: 'entropy' } : { tex: 'h(X)', name: 'differential entropy' }),
    },
    x: { f: x => x, tex: 'x', means: () => ({ tex: '\\mathbb{E}[X]', name: 'mean' }) },
    x2: { f: x => x * x, tex: 'x^2', means: () => ({ tex: '\\mathbb{E}[X^2]', name: 'second moment' }) },
    var: {
        f: (x, v, m) => (x - m) ** 2, tex: '(x - \\mathbb{E}[X])^2',
        means: () => ({ tex: '\\operatorname{Var}(X)', name: 'variance' }),
    },
    // undefined (NaN) when X is constant
    skew: {
        f: (x, v, m, s) => (s > 1e-12 ? ((x - m) / s) ** 3 : NaN), tex: '\\big((x - \\mathbb{E}[X]) / \\sigma_X\\big)^3',
        means: () => ({ tex: '\\operatorname{Skew}(X)', name: 'skewness' }),
    },
    // discrete only: one value per atom, set by dragging
    custom: { f: null, tex: '\\text{custom}' },
};

// What E[g(X)] is called for this g ({ tex, name }), or null.
export function meaning(g, disc) {
    return G[g].means ? G[g].means(disc) : null;
}

// Cache of g along the continuous samples, and its running integral over u.
let cache = { S: null, g: null, m: 0, s: 0, gs: null, I: null };
function alongSamples(S, g) {
    if (cache.S !== S || cache.g !== g) {
        const m = runningIntegral(S.Fs, S.xs).at(-1);
        const s = Math.sqrt(Math.max(0, runningIntegral(S.Fs, S.xs.map(x => (x - m) ** 2)).at(-1)));
        const gs = S.xs.map((x, i) => G[g].f(x, S.fs[i], m, s));
        cache = { S, g, m, s, gs, I: runningIntegral(S.Fs, gs) };
    }
    return cache;
}

// p_X(x) from the samples, and 0 outside a step density's support (the samples'
// end values would otherwise extend it).
export function densityAt(v, x) {
    const s = v.shape;
    if (s.kind === 'steps' && (x < s.ts[0] || x > s.ts[s.ts.length - 1])) return 0;
    return lerp(v.S.fs, atX(v.S, x));
}

// custom: g's values at the atoms, when g is 'custom' (discrete only).
export function computeFrame(model, pos, g, custom) {
    const v = model.view(), gf = G[g].f;
    if (v.disc) {
        const { p, F, n } = v;
        const m = p.reduce((t, q, i) => t + q * (i + 1), 0);
        const s = Math.sqrt(p.reduce((t, q, i) => t + q * (i + 1 - m) ** 2, 0));
        // g off the support (an atom without mass) has no value: it never enters the sum
        const gs = p.map((q, i) => (q <= 0 ? NaN : g === 'custom' ? custom[i] : gf(i + 1, q, m, s)));
        const cum = [0];
        gs.forEach((y, i) => cum.push(cum[i] + (p[i] > 0 ? p[i] * y : 0)));
        const u = pos.u;
        // the block holding u (its atom is x = k + 1); none while u = 0
        const k = u <= 0 ? -1 : F.findIndex((f, i) => i > 0 && f >= u - 1e-12) - 1;
        const area = k < 0 ? 0 : cum[k] + (u - F[k]) * gs[k];
        return { disc: true, p, F, n, gs, cum, x: pos.x, u, k, gNow: k >= 0 ? gs[k] : NaN, area, total: cum[n] };
    }
    const { S } = v, { m, s, gs, I } = alongSamples(S, g);
    // the height is g at F_X⁻¹(u), a point of the support, so it stays on the curve even
    // when x sits past the support's ends
    const xq = lerp(S.xs, atU(S, pos.u));
    return {
        disc: false, S, gs, I, x: pos.x, u: pos.u, fNow: densityAt(v, pos.x),
        gNow: gf(xq, lerp(S.fs, atX(S, xq)), m, s), area: lerp(I, atU(S, pos.u)), total: I[I.length - 1],
    };
}

// The same expectation over the real line: the weights g(x) p_X(x) (one per atom, NaN
// without mass; or along the continuous samples) and their sum or integral up to x.
// A point mass is counted whole, so in the discrete case this is the area up to
// u = F_X(x), the end of x's block.
export function productFrame(fr) {
    if (fr.disc) {
        const ys = fr.p.map((q, i) => (q > 0 ? q * fr.gs[i] : NaN));
        const kx = Math.max(0, Math.min(fr.n, Math.floor(fr.x + 1e-9))); // atoms 1..kx lie at or below x
        let upto = 0;
        for (let i = 0; i < kx; i++) if (fr.p[i] > 0) upto += ys[i];
        return { ys, upto };
    }
    const { S } = fr;
    const ys = S.xs.map((x, i) => { const y = fr.gs[i] * S.fs[i]; return Number.isFinite(y) ? y : 0; });
    return { ys, upto: lerp(fr.I, atX(S, fr.x)) };
}
