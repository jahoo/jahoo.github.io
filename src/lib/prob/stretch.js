// ================================================================
//  Probability figures — stretch.js
//  Y = aX as a view: a pmf keeps its probabilities and moves its atoms
//  to a·k (relabeled by a permutation if given); a density stretches
//  to p_X(y/a)/a. a > 0. Pure: no DOM.
// ================================================================

import { cdfOf, sampleShape } from './dist.js';

// The shape of aX.
export function stretchShape(s, a) {
    if (s.kind === 'steps') return { kind: 'steps', ts: s.ts.map(t => a * t), ms: s.ms.slice() };
    return { kind: 'mix', comps: s.comps.map(c => ({ w: c.w, m: a * c.m, s: a * c.s })) };
}

// The view of Y = aX, the atoms relabeled by perm (p[i] moves to slot perm[i]) if given.
export function stretchView(v, a, perm = null) {
    if (v.disc) {
        const p = v.p.slice();
        if (perm) perm.forEach((j, i) => { p[j] = v.p[i]; });
        const n = p.length;
        return { disc: true, p, F: cdfOf(p), n, xs: p.map((_, i) => a * (i + 1)), xRange: [a * 0.5, a * (n + 0.5)] };
    }
    const shape = stretchShape(v.shape, a), S = sampleShape(shape);
    const win = { x0: a * v.win.x0, x1: a * v.win.x1, y1: v.win.y1 / a };
    return { disc: false, shape, S, win, xRange: [win.x0, win.x1] };
}

// A uniformly random permutation of 0..n-1 (Fisher–Yates).
export function randomPerm(n, rng = Math.random) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    return p;
}
