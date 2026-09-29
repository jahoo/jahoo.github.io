// ================================================================
//  Differential entropy — dist.js
//  Densities, their masses over intervals, differential entropy,
//  and the Shannon entropy of the quantized variable. Pure math
//  on plain numbers and closures: no DOM. All entropies in bits.
// ================================================================

export const LN2 = Math.LN2;
export const log2 = x => Math.log(x) / LN2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Numerical Recipes erfcc, fractional error < 1.2e-7.
export function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
}

const SQ2PI = Math.sqrt(2 * Math.PI);

export function gPdf(x, m, s) {
    const z = (x - m) / s;
    return Math.exp(-0.5 * z * z) / (s * SQ2PI);
}

export function gCdf(x, m, s) {
    return 0.5 * erfc(-(x - m) / (s * Math.SQRT2));
}

// P(a <= X <= b) for X ~ N(m, s^2). Narrow intervals use Simpson's rule
// (differencing two erfc values loses precision there); wide ones use
// whichever tail form avoids subtracting two numbers close to 1.
export function gMass(a, b, m, s) {
    if (b <= a) return 0;
    if (b - a < 0.5 * s) {
        const c = (a + b) / 2;
        return (b - a) / 6 * (gPdf(a, m, s) + 4 * gPdf(c, m, s) + gPdf(b, m, s));
    }
    const za = (a - m) / (s * Math.SQRT2), zb = (b - m) / (s * Math.SQRT2);
    if (za >= 0) return 0.5 * (erfc(za) - erfc(zb));
    if (zb <= 0) return 0.5 * (erfc(-zb) - erfc(-za));
    return 1 - 0.5 * erfc(-za) - 0.5 * erfc(zb);
}

// -∫ f log2 f over [lo, hi] by composite Simpson's rule.
export function numEntropy(pdf, lo, hi, N = 6000) {
    const dx = (hi - lo) / N;
    let s = 0;
    for (let i = 0; i <= N; i++) {
        const f = pdf(lo + i * dx);
        const w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
        if (f > 0) s -= w * f * Math.log(f);
    }
    return s * dx / 3 / LN2;
}

// A distribution is { kind, pdf, cdf, mass(a, b), lo, hi, minScale, h, peak }:
// [lo, hi] holds essentially all the mass, minScale is the narrowest
// feature (used to decide when Δ is "small"), h is differential entropy.

// Evaluation points for a mixture over [x0, x1]: an even grid plus a
// dense patch around each component, so narrow bumps are resolved even
// when the components are far apart. Sorted, ascending.
export function sampleXs(comps, x0, x1, n = 500) {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * i / n);
    for (const c of comps) {
        for (let i = 0; i <= 240; i++) {
            const x = c.m + c.s * (-7 + 14 * i / 240);
            if (x > x0 && x < x1) xs.push(x);
        }
    }
    return xs.sort((a, b) => a - b);
}

// Gaussian mixture; comps = [{ w, m, s }].
export function mixDist(comps) {
    const pdf = x => { let v = 0; for (const c of comps) v += c.w * gPdf(x, c.m, c.s); return v; };
    const cdf = x => { let v = 0; for (const c of comps) v += c.w * gCdf(x, c.m, c.s); return v; };
    const mass = (a, b) => { let v = 0; for (const c of comps) v += c.w * gMass(a, b, c.m, c.s); return v; };
    const lo = Math.min(...comps.map(c => c.m - 9 * c.s));
    const hi = Math.max(...comps.map(c => c.m + 9 * c.s));
    const minScale = Math.min(...comps.map(c => c.s));
    // Simpson needs a step well below the narrowest component
    const N = 2 * Math.ceil(Math.min(100000, Math.max(3000, 20 * (hi - lo) / minScale)));
    const h = comps.length === 1
        ? 0.5 * log2(2 * Math.PI * Math.E * comps[0].s * comps[0].s)
        : numEntropy(pdf, lo, hi, N);
    let peak = 0;
    for (const x of sampleXs(comps, lo, hi, 1000)) peak = Math.max(peak, pdf(x));
    return { kind: 'smooth', comps, pdf, cdf, mass, lo, hi, minScale, h, peak };
}

// Uniform on [a, b].
export function unifDist(a, b) {
    const w = b - a;
    return {
        kind: 'unif', a, b,
        pdf: x => (x >= a && x <= b) ? 1 / w : 0,
        cdf: x => clamp((x - a) / w, 0, 1),
        mass: (u, v) => Math.max(0, Math.min(v, b) - Math.max(u, a)) / w,
        lo: a, hi: b, minScale: w, h: log2(w), peak: 1 / w,
    };
}

// Two-bump mixture, standardized to mean 0 and variance 1 so that the
// family() scale parameter is its standard deviation.
export const BIMODAL = (() => {
    const c = [{ w: .62, m: -.9, s: .42 }, { w: .38, m: 1.3, s: .55 }];
    const mu = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mu * mu;
    const sd = Math.sqrt(v);
    return c.map(k => ({ w: k.w, m: (k.m - mu) / sd, s: k.s / sd }));
})();

// One of the three families used on the page, with standard deviation sd.
export function family(name, sd) {
    if (name === 'gauss') return mixDist([{ w: 1, m: 0, s: sd }]);
    if (name === 'unif') {
        const w = sd * Math.sqrt(12);
        return unifDist(-w / 2, w / 2);
    }
    return mixDist(BIMODAL.map(k => ({ w: k.w, m: k.m * sd, s: k.s * sd })));
}

// Polyline of the density over [x0, x1]; exact corners for the uniform.
export function densityPts(d, x0, x1, N = 500) {
    if (d.kind === 'unif') {
        const ht = 1 / (d.b - d.a);
        const pts = [[x0, 0]];
        if (d.a > x0) pts.push([d.a, 0]);
        pts.push([Math.max(d.a, x0), ht], [Math.min(d.b, x1), ht]);
        if (d.b < x1) pts.push([d.b, 0]);
        pts.push([x1, 0]);
        return pts;
    }
    return sampleXs(d.comps, x0, x1, N).map(x => [x, d.pdf(x)]);
}

// Bin k covers [(k - 1/2)Δ, (k + 1/2)Δ]; the range of k that meets [lo, hi].
export function binRange(d, D) {
    return [Math.floor(d.lo / D + 0.5), Math.floor(d.hi / D + 0.5)];
}

// Shannon entropy H(X_Δ) of the bin index. Past 400k bins the sum is
// replaced by its small-Δ asymptote h + log2(1/Δ).
export function quantH(d, D) {
    const [k0, k1] = binRange(d, D);
    if (k1 - k0 > 400000) return d.h - log2(D);
    let H = 0;
    for (let k = k0; k <= k1; k++) {
        const p = d.mass((k - .5) * D, (k + .5) * D);
        if (p > 0) H -= p * Math.log(p);
    }
    return Math.max(0, H / LN2);
}

// Softmax of logits scaled by beta.
export function softmax(logits, beta) {
    const ex = logits.map(l => Math.exp(beta * l));
    const Z = ex.reduce((a, b) => a + b, 0);
    return ex.map(v => v / Z);
}

// Shannon entropy of a pmf, in bits.
export function shannonH(p) {
    return -p.reduce((t, q) => t + (q > 0 ? q * log2(q) : 0), 0);
}

// Quantile of a distribution by bisection on its cdf.
export function quantile(d, q) {
    let lo = d.lo, hi = d.hi;
    for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (d.cdf(m) < q) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
}

// ---- tempering and editing a pmf ----

// p^β, renormalized. β = 0 gives the uniform distribution on the support.
export function temper(p, beta) {
    const q = p.map(v => (v > 0 ? Math.pow(v, beta) : 0));
    const Z = q.reduce((a, b) => a + b, 0);
    return q.map(v => v / Z);
}

// Set p_i to target, rescaling the others to keep the sum at 1 and every
// entry at least minP (the temperature post's drag rule).
export function withProb(p, i, target, minP) {
    target = clamp(target, minP, 1 - (p.length - 1) * minP);
    const scale = (1 - target) / (1 - p[i]);
    const q = p.map((v, j) => (j === i ? target : Math.max(minP, v * scale)));
    const Z = q.reduce((a, b) => a + b, 0);
    return q.map(v => v / Z);
}

// ---- editable densities ----
// A shape is { kind: 'unif', a, b } or { kind: 'mix', comps: [{ w, m, s }] }.

export const S_MIN = 2 ** -7, S_MAX = 16;

// The standardized family, scaled to standard deviation sd (see family()).
export function familyShape(name, sd) {
    if (name === 'unif') {
        const w = sd * Math.sqrt(12);
        return { kind: 'unif', a: -w / 2, b: w / 2 };
    }
    const comps = name === 'gauss' ? [{ w: 1, m: 0, s: 1 }] : BIMODAL;
    return { kind: 'mix', comps: comps.map(k => ({ w: k.w, m: k.m * sd, s: k.s * sd })) };
}

export function shapeDist(shape) {
    return shape.kind === 'unif' ? unifDist(shape.a, shape.b) : mixDist(shape.comps);
}

export function shapeMoments(shape) {
    if (shape.kind === 'unif') {
        return { mean: (shape.a + shape.b) / 2, sd: (shape.b - shape.a) / Math.sqrt(12) };
    }
    const c = shape.comps;
    const mean = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mean * mean;
    return { mean, sd: Math.sqrt(Math.max(v, 0)) };
}

// Stretch the shape about its mean so its standard deviation is sd.
export function rescaleShape(shape, sd) {
    const { mean, sd: sd0 } = shapeMoments(shape);
    const k = sd / sd0;
    if (shape.kind === 'unif') {
        return { kind: 'unif', a: mean + (shape.a - mean) * k, b: mean + (shape.b - mean) * k };
    }
    return {
        kind: 'mix',
        comps: shape.comps.map(c => ({ w: c.w, m: mean + (c.m - mean) * k, s: clamp(c.s * k, S_MIN, S_MAX) })),
    };
}

// Move component i so the mixture density at its mean is y: the mean goes
// to x, and s solves w_i / (s √2π) = y − (the other components' density at x).
export function setPeak(comps, i, x, y) {
    const c = comps[i];
    let other = 0;
    comps.forEach((k, j) => { if (j !== i) other += k.w * gPdf(x, k.m, k.s); });
    const own = y - other;
    const s = own > 0 ? clamp(c.w / (own * SQ2PI), S_MIN, S_MAX) : S_MAX;
    return comps.map((k, j) => (j === i ? { w: k.w, m: x, s } : k));
}
