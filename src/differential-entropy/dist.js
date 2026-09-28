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

// Gaussian mixture; comps = [{ w, m, s }].
export function mixDist(comps) {
    const pdf = x => { let v = 0; for (const c of comps) v += c.w * gPdf(x, c.m, c.s); return v; };
    const cdf = x => { let v = 0; for (const c of comps) v += c.w * gCdf(x, c.m, c.s); return v; };
    const mass = (a, b) => { let v = 0; for (const c of comps) v += c.w * gMass(a, b, c.m, c.s); return v; };
    const lo = Math.min(...comps.map(c => c.m - 9 * c.s));
    const hi = Math.max(...comps.map(c => c.m + 9 * c.s));
    const minScale = Math.min(...comps.map(c => c.s));
    const h = comps.length === 1
        ? 0.5 * log2(2 * Math.PI * Math.E * comps[0].s * comps[0].s)
        : numEntropy(pdf, lo, hi);
    let peak = 0;
    for (let i = 0; i <= 2000; i++) peak = Math.max(peak, pdf(lo + (hi - lo) * i / 2000));
    return { kind: 'smooth', pdf, cdf, mass, lo, hi, minScale, h, peak };
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
    const pts = [];
    for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * i / N;
        pts.push([x, d.pdf(x)]);
    }
    return pts;
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
