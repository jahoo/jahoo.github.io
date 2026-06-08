// ================================================================
//  Interactive divergence fitting — mathutils.js
//  Pure, stateless math and formatting helpers. No DOM, no shared
//  state — every function is a pure map from its arguments.
// ================================================================

const sqrt2pi = Math.sqrt(2 * Math.PI);

export function gaussPdf(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * sqrt2pi);
}

export function gaussLogPdf(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return -0.5 * z * z - Math.log(sigma * sqrt2pi);
}

export function mixturePdf(x, comps) {
    let s = 0;
    for (const c of comps) s += c.w * gaussPdf(x, c.mu, c.sigma);
    return s;
}

export function mixtureLogPdf(x, comps) {
    let maxL = -Infinity;
    const lts = [];
    for (const c of comps) {
        const lt = Math.log(c.w) + gaussLogPdf(x, c.mu, c.sigma);
        lts.push(lt);
        if (lt > maxL) maxL = lt;
    }
    let s = 0;
    for (const lt of lts) s += Math.exp(lt - maxL);
    return maxL + Math.log(s);
}

// Box-Muller
export function randn() {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function softmax(arr) {
    let mx = -Infinity;
    for (let i = 0; i < arr.length; i++) if (arr[i] > mx) mx = arr[i];
    const e = new Float64Array(arr.length);
    let s = 0;
    for (let i = 0; i < arr.length; i++) { e[i] = Math.exp(arr[i] - mx); s += e[i]; }
    for (let i = 0; i < arr.length; i++) e[i] /= s;
    return e;
}

// Trapezoidal rule with n subintervals.
export function integrate(f, a, b, n) {
    const h = (b - a) / n;
    let s = 0.5 * (f(a) + f(b));
    for (let i = 1; i < n; i++) s += f(a + i * h);
    return s * h;
}

export function fmtNum(v) {
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '−∞';
    if (!isFinite(v)) return 'NaN';
    const a = Math.abs(v);
    if (a < 1e-3) return v.toExponential(2);
    if (a < 100) return v.toFixed(4);
    if (a < 1e6) return v.toFixed(1);
    return v.toExponential(2);
}
