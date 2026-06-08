// ================================================================
//  Interactive divergence fitting — algorithms.js
//  The core math of the demo: gradient estimators (MC + deterministic,
//  KL + χ²), optimal-solution finding, loss-landscape grids, and
//  divergence evaluation. Reads/writes shared state via `S`.
// ================================================================

import { S } from './state.js';
import { LAND_RES } from './config.js';
import {
    gaussPdf, gaussLogPdf, mixturePdf, mixtureLogPdf, randn, softmax, integrate,
} from './mathutils.js';
import {
    curP, qToLand, setQFromLand, landToMuSigma, muSigmaToLand, transformGrad,
} from './parameterizations.js';

// ===== Integration range =====
function intRange() {
    // Dynamic integration range: cover all modes plus generous tails
    let lo = Infinity, hi = -Infinity;
    for (const c of S.pComps) {
        lo = Math.min(lo, c.mu - 6 * c.sigma);
        hi = Math.max(hi, c.mu + 6 * c.sigma);
    }
    return [Math.min(lo, -10), Math.max(hi, 10)];
}

// ===== Optimal solutions =====
export function computeOptimal() {
    if (S.divergenceType === 'chisq') {
        S.optFwd = null;  // set by computeLandscapes via multi-start
    } else {
        // Forward KL: moment matching (analytic)
        let Ep = 0, Ep2 = 0;
        for (const c of S.pComps) {
            Ep += c.w * c.mu;
            Ep2 += c.w * (c.sigma * c.sigma + c.mu * c.mu);
        }
        const fwdVar = Ep2 - Ep * Ep;
        S.optFwd = { mu: Ep, sigma: Math.sqrt(Math.max(0.01, fwdVar)) };
    }
    S.optRev = [];
}

// ===== Loss landscape grids =====
export function computeLandBounds() {
    const [a1Lo, a1Hi, a2Lo, a2Hi] = curP().bounds(S.pComps, S.optFwd, S.optRev, [S.qFwd, S.qRev], S.divergenceType);
    S.landMuMin = a1Lo; S.landMuMax = a1Hi;
    S.landLsMin = a2Lo; S.landLsMax = a2Hi;
}

export function computeLandscapes(res, _retry) {
    res = res || LAND_RES;
    computeLandBounds();
    const mus = new Float64Array(res);
    const lss = new Float64Array(res);
    S.landCurRes = res;
    for (let i = 0; i < res; i++) {
        mus[i] = S.landMuMin + (S.landMuMax - S.landMuMin) * i / (res - 1);
        lss[i] = S.landLsMin + (S.landLsMax - S.landLsMin) * i / (res - 1);
    }

    S.landFwdGrid = new Float64Array(res * res);
    S.landRevGrid = new Float64Array(res * res);

    const [intA, intB] = intRange();
    for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
            const [mu, sigma] = landToMuSigma(mus[i], lss[j]);
            const idx = j * res + i;

            // Skip extreme parameter values (prevents slowdown at grid corners)
            if (!isFinite(mu) || !isFinite(sigma) || sigma > 30 || Math.abs(mu) > 50) {
                S.landFwdGrid[idx] = 100; S.landRevGrid[idx] = 100; continue;
            }

            // Integration range covers both q tails and p tails
            const lo = Math.min(intA, mu - 5 * sigma);
            const hi = Math.max(intB, mu + 5 * sigma);

            const nInt = res < 30 ? 100 : 300;  // fewer integration points for low-res

            if (S.divergenceType === 'chisq') {
                S.landFwdGrid[idx] = integrate(x => {
                    const px = mixturePdf(x, S.pComps);
                    const qx = gaussPdf(x, mu, sigma);
                    return qx > 1e-15 ? px * px / qx : 0;
                }, lo, hi, nInt) - 1;

                S.landRevGrid[idx] = integrate(x => {
                    const px = mixturePdf(x, S.pComps);
                    const qx = gaussPdf(x, mu, sigma);
                    return px > 1e-15 ? qx * qx / px : 0;
                }, lo, hi, nInt) - 1;
            } else {
                S.landFwdGrid[idx] = integrate(x => {
                    const px = mixturePdf(x, S.pComps);
                    if (px < 1e-15) return 0;
                    return px * (mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, mu, sigma));
                }, lo, hi, nInt);

                S.landRevGrid[idx] = integrate(x => {
                    const qx = gaussPdf(x, mu, sigma);
                    if (qx < 1e-15) return 0;
                    return qx * (gaussLogPdf(x, mu, sigma) - mixtureLogPdf(x, S.pComps));
                }, lo, hi, nInt);
            }
            // Negative divergence = numerical failure (no overlap); true value is +∞
            if (S.landFwdGrid[idx] < 0) S.landFwdGrid[idx] = Infinity;
            if (S.landRevGrid[idx] < 0) S.landRevGrid[idx] = Infinity;
        }
    }

    // Color range: absolute bottom at div≈0 (log10 floor),
    // top capped at the 85th percentile so basins aren't washed out
    const allVals = [];
    for (let i = 0; i < S.landFwdGrid.length; i++) {
        allVals.push(Math.max(S.landFwdGrid[i], 1e-3));
        allVals.push(Math.max(S.landRevGrid[i], 1e-3));
    }
    allVals.sort((a, b) => a - b);
    S.landVmin = Math.log10(1e-3);
    S.landVmax = Math.log10(allVals[Math.floor(allVals.length * 0.85)]);

    // ===== χ² gradient functions for multi-start optimization =====
    function chisqFwdEval(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        return integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            return qz > 1e-15 ? pz * pz / qz : 0;
        }, lo, hi, 800) - 1;
    }
    function gradChisqFwd(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        const sig2 = sigma * sigma;
        const gMu = -integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            if (qz < 1e-15) return 0;
            return (pz * pz / qz) * (z - mu) / sig2;
        }, lo, hi, 800);
        const gSigma = -integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            if (qz < 1e-15) return 0;
            return (pz * pz / qz) * ((z - mu) * (z - mu) / (sig2 * sigma) - 1 / sigma);
        }, lo, hi, 800);
        return { dmu: gMu, dsigma: gSigma };
    }
    function chisqRevEval(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        return integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            return pz > 1e-15 ? qz * qz / pz : 0;
        }, lo, hi, 800) - 1;
    }
    function gradChisqRev(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        const sig2 = sigma * sigma;
        const gMu = 2 * integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            if (pz < 1e-15) return 0;
            return (qz * qz / pz) * (z - mu) / sig2;
        }, lo, hi, 800);
        const gSigma = 2 * integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, mu, sigma);
            if (pz < 1e-15) return 0;
            return (qz * qz / pz) * ((z - mu) * (z - mu) / (sig2 * sigma) - 1 / sigma);
        }, lo, hi, 800);
        return { dmu: gMu, dsigma: gSigma };
    }

    // ===== Find optima via multi-start GD =====
    function klRevEval(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        return integrate(x => {
            const qx = gaussPdf(x, mu, sigma);
            if (qx < 1e-15) return 0;
            return qx * (gaussLogPdf(x, mu, sigma) - mixtureLogPdf(x, S.pComps));
        }, lo, hi, 800);
    }
    function gradRevRefine(mu, sigma) {
        const lo = Math.min(intA, mu - 6 * sigma);
        const hi = Math.max(intB, mu + 6 * sigma);
        function dLogP(x) {
            const px = mixturePdf(x, S.pComps);
            if (px < 1e-15) return 0;
            let dp = 0;
            for (const c of S.pComps)
                dp += c.w * gaussPdf(x, c.mu, c.sigma) * (-(x - c.mu) / (c.sigma * c.sigma));
            return dp / px;
        }
        const Eq_dlogp = integrate(x => gaussPdf(x, mu, sigma) * dLogP(x), lo, hi, 800);
        const Eq_z_dlogp = integrate(x => gaussPdf(x, mu, sigma) * ((x - mu) / sigma) * dLogP(x), lo, hi, 800);
        return { dmu: -Eq_dlogp, dsigma: -1 / sigma - Eq_z_dlogp };
    }

    function optimizeGeneric(evalFn, gradFn, startMu, startSigma) {
        let mu = startMu, sigma = startSigma;
        for (let i = 0; i < 500; i++) {
            const g = gradFn(mu, sigma);
            mu -= 0.02 * g.dmu;
            sigma -= 0.5 * 0.02 * g.dsigma;
            sigma = Math.max(0.1, sigma);
        }
        return { mu, sigma, kl: evalFn(mu, sigma) };
    }

    function multiStartOptimize(evalFn, gradFn) {
        const results = [];
        for (const c of S.pComps) results.push(optimizeGeneric(evalFn, gradFn, c.mu, c.sigma));
        const meanMu = S.pComps.reduce((s, c) => s + c.w * c.mu, 0);
        results.push(optimizeGeneric(evalFn, gradFn, meanMu, 1.5));
        for (let i = 0; i < S.pComps.length; i++)
            for (let j = i + 1; j < S.pComps.length; j++)
                results.push(optimizeGeneric(evalFn, gradFn, (S.pComps[i].mu + S.pComps[j].mu) / 2, 1.5));
        const optima = [];
        for (const r of results) {
            if (!isFinite(r.kl) || r.kl < -0.01) continue;
            const dup = optima.find(o => Math.abs(o.mu - r.mu) < 0.3 && Math.abs(o.sigma - r.sigma) < 0.3);
            if (dup) { if (r.kl < dup.kl) { dup.mu = r.mu; dup.sigma = r.sigma; dup.kl = r.kl; } }
            else optima.push({ ...r });
        }
        optima.sort((a, b) => a.kl - b.kl);
        return optima;
    }

    if (S.divergenceType === 'chisq') {
        const fwdOptima = multiStartOptimize(chisqFwdEval, gradChisqFwd);
        S.optFwd = fwdOptima.length > 0 ? fwdOptima[0] : { mu: 0, sigma: 1 };
        S.optRev = multiStartOptimize(chisqRevEval, gradChisqRev);
    } else {
        S.optRev = multiStartOptimize(klRevEval, gradRevRefine);
    }

    // Check if any optimum is outside the grid (can happen for χ² where
    // optima are found after bounds are computed). If so, recompute.
    function optimumInBounds(o) {
        const [a1, a2] = muSigmaToLand(o.mu, o.sigma);
        return a1 >= S.landMuMin && a1 <= S.landMuMax && a2 >= S.landLsMin && a2 <= S.landLsMax;
    }
    let needRecompute = false;
    if (S.optFwd && !optimumInBounds(S.optFwd)) needRecompute = true;
    for (const o of S.optRev) if (!optimumInBounds(o)) needRecompute = true;
    if (needRecompute && !_retry) return computeLandscapes(res, true);
}

// ===== MC Gradient Steps =====
// Adam update in the selected parameter space.
// Callers pass gradients in (μ, logσ) space; transformGrad converts them.
function adamUpdate(q, gradMu, gradLogSigma, state) {
    let [g1, g2] = transformGrad(gradMu, gradLogSigma, q);
    if (S.natGrad) [g1, g2] = curP().fisherInv(g1, g2, q);
    if (S.gradClip) {
        const gNorm = Math.sqrt(g1 * g1 + g2 * g2);
        if (gNorm > 5) { const s = 5 / gNorm; g1 *= s; g2 *= s; }
    }
    const [p1, p2] = qToLand(q);

    state.t++;
    const lr = S.baseLR / (1 + 0.001 * state.t);

    if (S.natGrad) {
        // SGD with momentum — Adam's per-parameter adaptivity
        // interferes with F⁻¹, breaking parameterization invariance
        const beta = 0.9;
        state.mMu = beta * state.mMu + (1 - beta) * g1;
        state.mSig = beta * state.mSig + (1 - beta) * g2;
        setQFromLand(p1 - lr * state.mMu, p2 - lr * state.mSig, q);
    } else {
        const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

        state.mMu = beta1 * state.mMu + (1 - beta1) * g1;
        state.vMu = beta2 * state.vMu + (1 - beta2) * g1 * g1;
        const mh = state.mMu / (1 - Math.pow(beta1, state.t));
        const vh = state.vMu / (1 - Math.pow(beta2, state.t));

        state.mSig = beta1 * state.mSig + (1 - beta1) * g2;
        state.vSig = beta2 * state.vSig + (1 - beta2) * g2 * g2;
        const mhs = state.mSig / (1 - Math.pow(beta1, state.t));
        const vhs = state.vSig / (1 - Math.pow(beta2, state.t));

        setQFromLand(
            p1 - lr * mh / (Math.sqrt(vh) + eps),
            p2 - lr * mhs / (Math.sqrt(vhs) + eps),
            q
        );
    }
}

export function stepForwardKL() {
    // Sample from q, compute IS weights targeting p, weight the score
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qFwd.mu + S.qFwd.sigma * randn();

    const logw = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
        logw[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qFwd.mu, S.qFwd.sigma);
    const w = softmax(logw);

    const sig2 = S.qFwd.sigma * S.qFwd.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
        const score_mu = (z[i] - S.qFwd.mu) / sig2;
        const score_ls = (z[i] - S.qFwd.mu) * (z[i] - S.qFwd.mu) / sig2 - 1;
        gMu += w[i] * score_mu;
        gLs += w[i] * score_ls;
    }
    // These are gradients of E_p[log q] (ascent direction); negate for descent on KL
    adamUpdate(S.qFwd, -gMu, -gLs, S.adamFwd);

    // alpha_i = w̄_i (self-normalized IS weights, all positive)
    return { z, alpha: w };
}

export function stepREINFORCE() {
    // Sample from q, compute reward = log p_tilde - log q, weight the score
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qRev.mu + S.qRev.sigma * randn();

    const reward = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
        reward[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma);

    const sig2 = S.qRev.sigma * S.qRev.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
        const score_mu = (z[i] - S.qRev.mu) / sig2;
        const score_ls = (z[i] - S.qRev.mu) * (z[i] - S.qRev.mu) / sig2 - 1;
        gMu += reward[i] * score_mu / S.K;
        gLs += reward[i] * score_ls / S.K;
    }
    // gMu, gLs are d(ELBO)/d(mu), d(ELBO)/d(log_sigma) — ascent on ELBO
    adamUpdate(S.qRev, -gMu, -gLs, S.adamRev);

    // alpha_i = r_i / K (signed)
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) alpha[i] = reward[i] / S.K;
    return { z, alpha };
}

export function stepReverseKL() {
    // Reparameterized: z = mu + sigma * eps, backprop through z
    const eps = new Float64Array(S.K);
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) {
        eps[i] = randn();
        z[i] = S.qRev.mu + S.qRev.sigma * eps[i];
    }

    // d(ELBO)/d(mu) = E[d/dz log p_tilde(z)]
    // d(ELBO)/d(log_sigma) = E[d/dz log p_tilde(z) * sigma * eps] + 1
    // We compute d/dz log p(z) = score of the target
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
        const px = mixturePdf(z[i], S.pComps);
        if (px < 1e-15) continue;
        let dpx = 0;
        for (const c of S.pComps)
            dpx += c.w * gaussPdf(z[i], c.mu, c.sigma) * (-(z[i] - c.mu) / (c.sigma * c.sigma));
        const score_p = dpx / px;
        gMu += score_p / S.K;
        gLs += score_p * S.qRev.sigma * eps[i] / S.K;
    }
    gLs += 1;  // entropy term

    // gMu, gLs are d(ELBO)/d(mu), d(ELBO)/d(log_sigma) — ascent on ELBO = descent on KL
    adamUpdate(S.qRev, -gMu, -gLs, S.adamRev);

    // alpha_i = r_i / K for visualization (signed)
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
        alpha[i] = (mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma)) / S.K;
    return { z, alpha };
}

// ===== Deterministic gradient steps (quadrature / closed-form) =====
export function stepForwardKL_deterministic() {
    // Closed-form gradient: dKL/dmu = (mu - E_p[x]) / sigma^2
    //                       dKL/d(logSigma) = 1 - E_p[(x-mu)^2] / sigma^2
    const mu = S.qFwd.mu, sigma = S.qFwd.sigma, sig2 = sigma * sigma;
    let Epx = 0, Epxmu2 = 0;
    for (const c of S.pComps) {
        Epx += c.w * c.mu;
        Epxmu2 += c.w * (c.sigma * c.sigma + (c.mu - mu) * (c.mu - mu));
    }
    adamUpdate(S.qFwd, (mu - Epx) / sig2, 1 - Epxmu2 / sig2, S.adamFwd);
}

export function stepReverseKL_deterministic() {
    // Numerical integration: dKL/dmu = -E_q[d/dx log p(x)]
    //                        dKL/d(logSigma) = -1 - E_q[(x-mu) * d/dx log p(x)]
    const mu = S.qRev.mu, sigma = S.qRev.sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);

    function dLogP(x) {
        const px = mixturePdf(x, S.pComps);
        if (px < 1e-15) return 0;
        let dpx = 0;
        for (const c of S.pComps)
            dpx += c.w * gaussPdf(x, c.mu, c.sigma) * (-(x - c.mu) / (c.sigma * c.sigma));
        return dpx / px;
    }

    const Eq_dlogp = integrate(x => gaussPdf(x, mu, sigma) * dLogP(x), lo, hi, 400);
    const Eq_xmu_dlogp = integrate(x => gaussPdf(x, mu, sigma) * (x - mu) * dLogP(x), lo, hi, 400);

    adamUpdate(S.qRev, -Eq_dlogp, -1 - Eq_xmu_dlogp, S.adamRev);
}

// ===== χ² MC gradient steps =====
export function stepForwardChisq() {
    // Sample from q, compute IS weights, use w̄² weighting
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qFwd.mu + S.qFwd.sigma * randn();

    const logw = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
        logw[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qFwd.mu, S.qFwd.sigma);
    const w = softmax(logw);

    const sig2 = S.qFwd.sigma * S.qFwd.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
        const w2 = w[i] * w[i];
        const score_mu = (z[i] - S.qFwd.mu) / sig2;
        const score_ls = (z[i] - S.qFwd.mu) * (z[i] - S.qFwd.mu) / sig2 - 1;
        gMu += S.K * w2 * score_mu;
        gLs += S.K * w2 * score_ls;
    }
    adamUpdate(S.qFwd, -gMu, -gLs, S.adamFwd);

    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) alpha[i] = w[i] * w[i];
    return { z, alpha };
}

export function stepReverseChisq() {
    // Sample from q, weight by q/p = e^{-r}
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qRev.mu + S.qRev.sigma * randn();

    const sig2 = S.qRev.sigma * S.qRev.sigma;
    let gMu = 0, gLs = 0;
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) {
        const r = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma);
        const qOverP = Math.exp(-r);
        const score_mu = (z[i] - S.qRev.mu) / sig2;
        const score_ls = (z[i] - S.qRev.mu) * (z[i] - S.qRev.mu) / sig2 - 1;
        gMu += 2 * qOverP * score_mu / S.K;
        gLs += 2 * qOverP * score_ls / S.K;
        alpha[i] = -qOverP;
    }
    adamUpdate(S.qRev, gMu, gLs, S.adamRev);

    return { z, alpha };
}

// ===== χ² deterministic gradient steps =====
export function stepForwardChisq_deterministic() {
    const mu = S.qFwd.mu, sigma = S.qFwd.sigma, sig2 = sigma * sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);

    const gMu = -integrate(z => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (qz < 1e-15) return 0;
        return (pz * pz / qz) * (z - mu) / sig2;
    }, lo, hi, 400);

    const gLs = -integrate(z => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (qz < 1e-15) return 0;
        return (pz * pz / qz) * ((z - mu) * (z - mu) / sig2 - 1);
    }, lo, hi, 400);

    adamUpdate(S.qFwd, gMu, gLs, S.adamFwd);
}

export function stepReverseChisq_deterministic() {
    const mu = S.qRev.mu, sigma = S.qRev.sigma, sig2 = sigma * sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);

    const gMu = 2 * integrate(z => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (pz < 1e-15) return 0;
        return (qz * qz / pz) * (z - mu) / sig2;
    }, lo, hi, 400);

    const gLs = 2 * integrate(z => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (pz < 1e-15) return 0;
        return (qz * qz / pz) * ((z - mu) * (z - mu) / sig2 - 1);
    }, lo, hi, 400);

    adamUpdate(S.qRev, gMu, gLs, S.adamRev);
}

// ===== χ² evaluation =====
export function chisqEval(qMu, qSigma, direction) {
    const [iA, iB] = intRange();
    const lo = Math.min(iA, qMu - 6 * qSigma);
    const hi = Math.max(iB, qMu + 6 * qSigma);
    if (direction === 'forward') {
        return integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, qMu, qSigma);
            return qz > 1e-15 ? pz * pz / qz : 0;
        }, lo, hi, 400) - 1;
    } else {
        return integrate(z => {
            const pz = mixturePdf(z, S.pComps);
            const qz = gaussPdf(z, qMu, qSigma);
            return pz > 1e-15 ? qz * qz / pz : 0;
        }, lo, hi, 400) - 1;
    }
}

// ===== KL evaluation (for display) =====
export function klEval(qMu, qSigma, direction) {
    const [iA, iB] = intRange();
    const lo = Math.min(iA, qMu - 6 * qSigma);
    const hi = Math.max(iB, qMu + 6 * qSigma);
    if (direction === 'forward') {
        return integrate(x => {
            const px = mixturePdf(x, S.pComps);
            if (px < 1e-15) return 0;
            return px * (mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, qMu, qSigma));
        }, lo, hi, 400);
    } else {
        return integrate(x => {
            const qx = gaussPdf(x, qMu, qSigma);
            if (qx < 1e-15) return 0;
            return qx * (gaussLogPdf(x, qMu, qSigma) - mixtureLogPdf(x, S.pComps));
        }, lo, hi, 400);
    }
}

export function divForward() {
    return S.divergenceType === 'chisq'
        ? chisqEval(S.qFwd.mu, S.qFwd.sigma, 'forward')
        : klEval(S.qFwd.mu, S.qFwd.sigma, 'forward');
}

export function divReverse() {
    return S.divergenceType === 'chisq'
        ? chisqEval(S.qRev.mu, S.qRev.sigma, 'reverse')
        : klEval(S.qRev.mu, S.qRev.sigma, 'reverse');
}
