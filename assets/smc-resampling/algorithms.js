// ================================================================
//  SMC Resampling — algorithms.js
//  Config constants, utility functions, resampling algorithms,
//  test function system, and trial runner.
//  Exposes everything on window.SMC namespace.
// ================================================================

'use strict';

window.SMC = (function () {

    // ================================================================
    //  CONFIGURATION
    // ================================================================

    const N = 8;
    const MIN_W = 0.01;

    // Uniform cool gray for all particles — deliberately understated
    // so method colors (orange/blue/green/purple/brown) carry the visual signal.
    // Particle identity is encoded by y-position, not color.
    const PARTICLE_COLOR = 'rgb(176,182,190)';
    const PALETTE = Array.from({length: N}, () => PARTICLE_COLOR);

    const METHOD_COLORS = {
        multinomial: '#e67e22',
        stratified:  '#2980b9',
        systematic:  '#27ae60',
        residual:    '#8e44ad',
        branchkill:  '#795548',
    };

    // ================================================================
    //  UTILITIES
    // ================================================================

    function cumulativeSum(arr) {
        const out = new Array(arr.length);
        out[0] = arr[0];
        for (let i = 1; i < arr.length; i++) out[i] = out[i - 1] + arr[i];
        return out;
    }

    function searchSorted(cumsum, u) {
        let lo = 0, hi = cumsum.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (cumsum[mid] < u) lo = mid + 1; else hi = mid;
        }
        return Math.min(lo, cumsum.length - 1);
    }

    function normalize(arr) {
        const s = arr.reduce((a, b) => a + b, 0);
        if (s > 0) for (let i = 0; i < arr.length; i++) arr[i] /= s;
    }

    function countIndices(indices, n) {
        const c = new Array(n).fill(0);
        for (const idx of indices) c[idx]++;
        return c;
    }

    function getPos(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function resetCanvas(canvas) {
        const d = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = Math.round(w * d);
        canvas.height = Math.round(h * d);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(d, 0, 0, d, 0, 0);
        return { ctx, w, h };
    }

    // ================================================================
    //  RESAMPLING ALGORITHMS  (matching filterpy)
    // ================================================================

    const resample = {
        multinomial(w) {
            const n = w.length;
            const cs = cumulativeSum(w); cs[n - 1] = 1.0;
            return Array.from({length: n}, () => searchSorted(cs, Math.random()));
        },
        stratified(w) {
            const n = w.length, cs = cumulativeSum(w), idx = [];
            let j = 0;
            for (let k = 0; k < n; k++) {
                const u = (Math.random() + k) / n;
                while (j < n - 1 && u > cs[j]) j++;
                idx.push(j);
            }
            return idx;
        },
        systematic(w, offset) {
            const n = w.length;
            const u0 = (offset !== undefined) ? offset : Math.random() / n;
            const cs = cumulativeSum(w), idx = [];
            let j = 0;
            for (let k = 0; k < n; k++) {
                const u = u0 + k / n;
                while (j < n - 1 && u > cs[j]) j++;
                idx.push(j);
            }
            return idx;
        },
        branchkill(w) {
            const n = w.length, idx = [];
            for (let i = 0; i < n; i++) {
                const nw = n * w[i];
                const det = Math.floor(nw);
                const bonus = Math.random() >= 1 - (nw - det) ? 1 : 0;
                for (let c = 0; c < det + bonus; c++) idx.push(i);
            }
            return idx;
        },
        residual(w, phase2Method) {
            const n = w.length, idx = [];
            const copies = w.map(wi => Math.floor(n * wi));
            for (let i = 0; i < n; i++)
                for (let c = 0; c < copies[i]; c++) idx.push(i);
            const res = w.map((wi, i) => wi - copies[i] / n);
            const resSum = res.reduce((a, b) => a + b, 0);
            const normRes = resSum > 0 ? res.map(r => r / resSum) : res.map(() => 1 / n);
            const cs = cumulativeSum(normRes); cs[n - 1] = 1.0;
            const R = n - idx.length;
            // Phase 2: fill remaining R slots using the chosen method
            if (phase2Method === 'stratified') {
                let j = 0;
                for (let k = 0; k < R; k++) {
                    const u = (Math.random() + k) / R;
                    while (j < n - 1 && u > cs[j]) j++;
                    idx.push(j);
                }
            } else if (phase2Method === 'systematic') {
                const u0 = Math.random() / R;
                let j = 0;
                for (let k = 0; k < R; k++) {
                    const u = u0 + k / R;
                    while (j < n - 1 && u > cs[j]) j++;
                    idx.push(j);
                }
            } else {
                // Default: multinomial
                for (let i = 0; i < R; i++) idx.push(searchSorted(cs, Math.random()));
            }
            return idx;
        },
    };

    // ================================================================
    //  TEST FUNCTION for estimator variance comparison
    // ================================================================

    let testFnKey = 'position';
    let indicatorK = 3; // default particle index for indicator function (0-based)
    let residualPhase2 = 'multinomial'; // phase-2 method for residual resampling

    const TEST_FNS = {
        position: {
            label: 'f(\u03BEn) = n/N',
            latexLabel: '$f(\\xi^n)=n/N$',
            values: () => Array.from({length: N}, (_, i) => (i + 1) / N),
        },
        indicator: {
            label: () => `f(\u03BEn) = 1{n=${indicatorK + 1}}`,
            latexLabel: () => `$f(\\xi^n)=\\mathbf{1}\\{n=${indicatorK + 1}\\}$`,
            values: () => Array.from({length: N}, (_, i) => i === indicatorK ? 1 : 0),
        },
        tail: {
            label: 'f(\u03BEn) = 1{n\u22655}',
            latexLabel: '$f(\\xi^n)=\\mathbf{1}\\{n\\geq 5\\}$',
            values: () => Array.from({length: N}, (_, i) => i >= 4 ? 1 : 0),
        },
        square: {
            label: 'f(\u03BEn) = (n/N)\u00B2',
            latexLabel: '$f(\\xi^n)=(n/N)^2$',
            values: () => Array.from({length: N}, (_, i) => ((i + 1) / N) ** 2),
        },
        evenodd: {
            label: 'f(\u03BEn) = 1{n even}',
            latexLabel: '$f(\\xi^n)=\\mathbf{1}\\{n\\text{ even}\\}$',
            values: () => Array.from({length: N}, (_, i) => i % 2 === 0 ? 1 : 0),
        },
    };

    function getTestFnLabel() {
        const t = TEST_FNS[testFnKey];
        return typeof t.latexLabel === 'function' ? t.latexLabel() : t.latexLabel;
    }

    function getTestFnValues() {
        return TEST_FNS[testFnKey].values();
    }

    // ================================================================
    //  K-TRIAL RUNNER (returns mean counts + estimator variance)
    // ================================================================

    /**
     * Run K resampling trials. Stores raw per-trial count vectors so
     * estimator values can be recomputed for any test function without
     * re-running the trials.
     */
    function runTrials(method, K) {
        const weights = window.SMC.weights;
        const sums = new Array(N).fill(0);
        const sumSq = new Array(N).fill(0);
        const allCounts = new Array(K);  // store raw count vectors
        for (let t = 0; t < K; t++) {
            const idx = method(weights);
            const c = countIndices(idx, N);
            allCounts[t] = c;
            for (let i = 0; i < N; i++) { sums[i] += c[i]; sumSq[i] += c[i] * c[i]; }
        }
        const means = sums.map(s => s / K);
        const stds = means.map((m, i) => Math.sqrt(Math.max(0, sumSq[i] / K - m * m)));
        return { means, stds, allCounts, K };
    }

    /**
     * Compute estimator values from stored count vectors for the
     * current test function. Cheap — no resampling needed.
     */
    function evalEstimators(hist) {
        if (!hist || !hist.allCounts) return null;
        const fVals = getTestFnValues();
        const weights = window.SMC.weights;
        const K = hist.K;
        const estimators = new Array(K);
        for (let t = 0; t < K; t++) {
            estimators[t] = hist.allCounts[t].reduce((s, ci, i) => s + ci * fVals[i], 0) / N;
        }
        const estMean = estimators.reduce((a, b) => a + b, 0) / K;
        const estVar = estimators.reduce((s, v) => s + (v - estMean) ** 2, 0) / K;
        const trueVal = weights.reduce((s, w, i) => s + w * fVals[i], 0);
        return { estimators, estVar, trueVal };
    }

    // ================================================================
    //  GAUSSIAN KDE
    // ================================================================

    function gaussianKDE(samples, nPoints, lo, hi) {
        const n = samples.length;
        if (n === 0) return [];
        const mean = samples.reduce((a, b) => a + b, 0) / n;
        const sigma = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 0.01;
        // Silverman's rule of thumb
        const h = 1.06 * sigma * Math.pow(n, -0.2);
        const invH = 1 / h;
        const invSqrt2pi = 1 / Math.sqrt(2 * Math.PI);
        const points = [];
        for (let i = 0; i < nPoints; i++) {
            const x = lo + (hi - lo) * i / (nPoints - 1);
            let density = 0;
            for (let j = 0; j < n; j++) {
                const z = (x - samples[j]) * invH;
                density += invSqrt2pi * Math.exp(-0.5 * z * z);
            }
            density /= (n * h);
            points.push({ x, y: density });
        }
        return points;
    }

    // ================================================================
    //  PUBLIC API
    // ================================================================

    return {
        // Config
        N,
        MIN_W,
        PALETTE,
        METHOD_COLORS,

        // Utilities
        cumulativeSum,
        searchSorted,
        normalize,
        countIndices,
        getPos,
        resetCanvas,

        // Resampling
        resample,

        // Test functions
        TEST_FNS,
        get testFnKey() { return testFnKey; },
        set testFnKey(v) { testFnKey = v; },
        get indicatorK() { return indicatorK; },
        set indicatorK(v) { indicatorK = v; },
        get residualPhase2() { return residualPhase2; },
        set residualPhase2(v) { residualPhase2 = v; },
        getTestFnLabel,
        getTestFnValues,

        // Trials
        runTrials,
        evalEstimators,
        gaussianKDE,

        // State (will be set by main.js)
        weights: null,
        probes: null,
        hoverU: null,
        sec3: null,
        sec4: null,
        sec5: null,
        sec6: null,
        secBK: null,
        compData: null,
        counterData: null,
    };

})();
