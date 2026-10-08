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

// Piecewise-constant density: chunk i covers [ts[i], ts[i+1]] and holds
// mass ms[i] (the ms sum to 1), so its height is ms[i] / width. Its
// differential entropy has a closed form: with widths w_i,
//   h = -Σ m_i log(m_i / w_i) = H(m) + Σ m_i log w_i.
export function stepsDist(ts, ms) {
    const K = ms.length;
    const ws = ms.map((_, i) => ts[i + 1] - ts[i]);
    const hs = ms.map((m, i) => m / ws[i]);
    const cum = [0];
    for (let i = 0; i < K; i++) cum.push(cum[i] + ms[i]);
    const cdf = x => {
        if (x <= ts[0]) return 0;
        if (x >= ts[K]) return 1;
        let i = 0;
        while (x > ts[i + 1]) i++;
        return cum[i] + hs[i] * (x - ts[i]);
    };
    return {
        kind: 'steps', ts, ms, ws, hs,
        pdf: x => {
            if (x < ts[0] || x > ts[K]) return 0;
            let i = 0;
            while (i < K - 1 && x > ts[i + 1]) i++;
            return hs[i];
        },
        cdf,
        mass: (u, v) => Math.max(0, cdf(v) - cdf(u)),
        lo: ts[0], hi: ts[K],
        minScale: Math.min(...ws),
        h: ms.reduce((t, m, i) => t + (m > 0 ? m * log2(ws[i] / m) : 0), 0),
        peak: Math.max(...hs),
    };
}

// Uniform on [a, b]: the one-chunk case.
export function unifDist(a, b) {
    return stepsDist([a, b], [1]);
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

// Polyline of the density over [x0, x1]; exact corners for step densities.
export function densityPts(d, x0, x1, N = 500) {
    if (d.kind === 'steps') {
        const { ts, hs } = d, K = hs.length;
        const pts = [[x0, 0]];
        if (ts[0] > x0) pts.push([ts[0], 0]);
        for (let i = 0; i < K; i++) {
            const a = clamp(ts[i], x0, x1), b = clamp(ts[i + 1], x0, x1);
            pts.push([a, hs[i]], [b, hs[i]]);
        }
        if (ts[K] < x1) pts.push([ts[K], 0]);
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

// p^β, renormalized. β = 0 gives the uniform distribution on the support, and
// β = ∞ (the end snap of a β slider) the limit, uniform on the argmax(es).
export function temper(p, beta) {
    if (beta === Infinity) {
        const max = Math.max(...p);
        const q = p.map(v => (v === max ? 1 : 0));
        const Z = q.reduce((a, b) => a + b, 0);
        return q.map(v => v / Z);
    }
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

// Set p[i] to target (in [0, 1], popping to 0 below snap) and rescale the others
// to keep the total 1, in proportion; when they have no mass between them, evenly.
// Unlike withProb, a mass can be exactly zero.
export function withMass(p, i, target, snap) {
    const t = target < snap ? 0 : Math.min(target, 1), rest = 1 - p[i], n = p.length;
    return p.map((v, j) => (j === i ? t : rest > 1e-12 ? v * (1 - t) / rest : (1 - t) / (n - 1)));
}

// ---- editable densities ----
// A shape is { kind: 'steps', ts, ms } (the uniform is one chunk) or
// { kind: 'mix', comps: [{ w, m, s }] }.

export const S_MIN = 2 ** -7, S_MAX = 16;
export const MIN_WIDTH = 2 ** -6; // narrowest chunk
export const MIN_MASS = 0.01;     // floor for a chunk's mass, as for the pmf

// Masses for the step preset: five equal-width chunks.
const STEP_MASSES = [0.10, 0.28, 0.34, 0.18, 0.10];

// The standardized family, scaled to standard deviation sd (see family()).
export function familyShape(name, sd) {
    if (name === 'unif') {
        const w = sd * Math.sqrt(12);
        return { kind: 'steps', ts: [-w / 2, w / 2], ms: [1] };
    }
    if (name === 'steps') {
        const K = STEP_MASSES.length;
        const shape = { kind: 'steps', ts: STEP_MASSES.map((_, i) => i - K / 2).concat(K / 2), ms: STEP_MASSES.slice() };
        const { mean } = shapeMoments(shape);
        return rescaleShape({ kind: 'steps', ts: shape.ts.map(t => t - mean), ms: shape.ms }, sd);
    }
    const comps = name === 'gauss' ? [{ w: 1, m: 0, s: 1 }] : BIMODAL;
    return { kind: 'mix', comps: comps.map(k => ({ w: k.w, m: k.m * sd, s: k.s * sd })) };
}

export function shapeDist(shape) {
    return shape.kind === 'steps' ? stepsDist(shape.ts, shape.ms) : mixDist(shape.comps);
}

export function shapeMoments(shape) {
    if (shape.kind === 'steps') {
        const { ts, ms } = shape;
        let mean = 0, m2 = 0;
        ms.forEach((m, i) => {
            const c = (ts[i] + ts[i + 1]) / 2, w = ts[i + 1] - ts[i];
            mean += m * c;
            m2 += m * (c * c + w * w / 12);
        });
        return { mean, sd: Math.sqrt(Math.max(m2 - mean * mean, 0)) };
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
    if (shape.kind === 'steps') {
        return { kind: 'steps', ts: shape.ts.map(t => mean + (t - mean) * k), ms: shape.ms.slice() };
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

// Set component i's weight to w (kept inside (0, 1) so no bump vanishes), the
// others rescaled to keep the total at 1; means and sds stay.
export const MIN_W = 0.02;
export function setWeight(comps, i, w) {
    w = clamp(w, MIN_W, 1 - MIN_W);
    const rest = 1 - comps[i].w, scale = rest > 0 ? (1 - w) / rest : 0;
    return comps.map((k, j) => ({ ...k, w: j === i ? w : (rest > 0 ? k.w * scale : (1 - w) / (comps.length - 1)) }));
}

// Move step point j to x, keeping every chunk's mass (so the two chunks
// beside it change height) and every chunk at least MIN_WIDTH wide.
export function setBreak(shape, j, x) {
    const ts = shape.ts.slice(), K = shape.ms.length;
    const lo = j > 0 ? ts[j - 1] + MIN_WIDTH : -Infinity;
    const hi = j < K ? ts[j + 1] - MIN_WIDTH : Infinity;
    ts[j] = clamp(x, lo, hi);
    return { kind: 'steps', ts, ms: shape.ms.slice() };
}

// Set chunk i's height to y: its mass becomes y × width and the other
// masses rescale to keep the total at 1 (the pmf drag rule, withProb).
export function setLevel(shape, i, y) {
    const w = shape.ts[i + 1] - shape.ts[i];
    return { kind: 'steps', ts: shape.ts.slice(), ms: withProb(shape.ms, i, y * w, MIN_MASS) };
}

// ---- sampled CDFs and quantiles (both figures of the expectation post) ----

// F with F[0] = 0 and F[k] = P(X ≤ k) for atoms at 1..n.
export function cdfOf(p) {
    const F = [0];
    p.forEach((v, i) => F.push(F[i] + v));
    return F;
}

// F_X(x) for atoms at 1..n: right-continuous, so the atom at x counts once x reaches it.
export function discCdfAt(F, x) {
    return F[clamp(Math.floor(x + 1e-9), 0, F.length - 1)];
}

// F_X⁻¹(u) = min{x : F_X(x) ≥ u}: the atom whose block (F[k−1], F[k]] holds u; 0 for u ≤ 0.
export function discQuantile(F, u) {
    if (u <= 0) return 0;
    const k = F.findIndex((f, i) => i > 0 && f >= u - 1e-12);
    return k === -1 ? F.length - 1 : k;
}

// Sorted samples of a shape over its support: x, density, CDF.
export function sampleShape(shape) {
    const xs = [], fs = [], Fs = [];
    if (shape.kind === 'steps') {
        const { ts, ms } = shape, e = 1e-9;
        let F = 0;
        ms.forEach((m, i) => {
            const w = ts[i + 1] - ts[i], h = m / w;
            for (let j = 0; j <= 40; j++) {
                const x = ts[i] + (j === 0 ? e : j === 40 ? w - e : w * j / 40);
                xs.push(x); fs.push(h); Fs.push(F + h * (x - ts[i]));
            }
            F += m;
        });
    } else {
        const c = shape.comps, N = 1600;
        const lo = Math.min(...c.map(k => k.m - 7 * k.s)), hi = Math.max(...c.map(k => k.m + 7 * k.s));
        for (let i = 0; i <= N; i++) {
            const x = lo + (hi - lo) * i / N;
            let f = 0, F = 0;
            for (const k of c) { f += k.w * gPdf(x, k.m, k.s); F += k.w * gCdf(x, k.m, k.s); }
            xs.push(x); fs.push(f); Fs.push(F);
        }
    }
    return { xs, fs, Fs, peak: Math.max(...fs) };
}

// Interpolation index into sorted samples, by x or by u.
function bisect(arr, v) {
    const n = arr.length;
    if (v <= arr[0]) return { j: 0, t: 0 };
    if (v >= arr[n - 1]) return { j: n - 2, t: 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
    const d = arr[hi] - arr[lo];
    return { j: lo, t: d > 0 ? (v - arr[lo]) / d : 0 };
}
export const atX = (S, x) => bisect(S.xs, x);
export const atU = (S, u) => bisect(S.Fs, u);
export const lerp = (arr, L) => arr[L.j] + (arr[L.j + 1] - arr[L.j]) * L.t;

// ∫ g du along the samples (trapezoid), I[0] = 0.
export function runningIntegral(Fs, gs) {
    const I = [0];
    for (let i = 1; i < gs.length; i++) I.push(I[i - 1] + (Fs[i] - Fs[i - 1]) * (gs[i] + gs[i - 1]) / 2);
    return I;
}
