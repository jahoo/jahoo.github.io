// ================================================================
//  Interactive divergence fitting — parameterizations.js
//  The φ-parameterization registry and the "current parameterization"
//  accessors. Each PARAMS entry is self-contained pure math (maps over
//  its arguments); add/remove entries to change the dropdown options.
// ================================================================

import { S } from './state.js';
import { X_MIN, X_MAX } from './config.js';

export const PARAMS = {
    'natural': {
        label: 'η₁, η₂',
        formula: '\\textcolor{#7B2D8E}{q_\\phi}(x) \\propto \\exp(\\eta_1 x + \\eta_2 x^2)',
        tooltip() {
            return S.divergenceType === 'chisq'
                ? 'Natural (exponential family) parameters. Both forward KL and forward χ² are convex in φ (χ² is even log-convex). The only parameterization here where gradient descent is guaranteed to find the global optimum.'
                : 'Natural (exponential family) parameters. Forward KL is convex in φ — the only parameterization here where gradient descent is guaranteed to find the global optimum.';
        },
        axes: ['η₁', 'η₂'],
        fromQ(q) {
            const s2 = q.sigma * q.sigma;
            return [q.mu / s2, -1 / (2 * s2)];
        },
        toQ(a1, a2, q) {
            a2 = Math.min(-0.02, a2);  // σ < ~5
            const s2 = -1 / (2 * a2);
            q.mu = a1 * s2;
            q.logSigma = 0.5 * Math.log(s2);
        },
        toMuSigma(a1, a2) {
            a2 = Math.min(-0.02, a2);
            const s2 = -1 / (2 * a2);
            return [a1 * s2, Math.sqrt(s2)];
        },
        fromMuSigma(mu, sigma) {
            const s2 = sigma * sigma;
            return [mu / s2, -1 / (2 * s2)];
        },
        transformGrad(gMu, gLs, q) {
            const s2 = q.sigma * q.sigma;
            return [s2 * gMu, 2 * q.mu * s2 * gMu + s2 * gLs];
        },
        // F^{-1} for natural params: full 2×2, det(F) = 2σ⁶
        fisherInv(g1, g2, q) {
            const s2 = q.sigma * q.sigma, s4 = s2 * s2, mu = q.mu;
            const det = 2 * s2 * s4;
            return [((4*mu*mu*s2 + 2*s4) * g1 - 2*mu*s2 * g2) / det,
                    (-2*mu*s2 * g1 + s2 * g2) / det];
        },
        hoverLabel(a1, a2) { return 'η₁ = ' + a1.toFixed(2) + '<br>η₂ = ' + a2.toFixed(3); },
        bounds(pComps, optFwd, optRev, qs, divType) {
            const pts = [];
            for (const c of pComps) {
                const s2 = c.sigma * c.sigma;
                pts.push([c.mu / s2, -1 / (2 * s2)]);
            }
            if (optFwd) {
                const s2 = optFwd.sigma * optFwd.sigma;
                pts.push([optFwd.mu / s2, -1 / (2 * s2)]);
            }
            for (const o of optRev) {
                const s2 = o.sigma * o.sigma;
                pts.push([o.mu / s2, -1 / (2 * s2)]);
            }
            for (const q of qs) {
                const s2 = q.sigma * q.sigma;
                pts.push([q.mu / s2, -1 / (2 * s2)]);
            }
            let a1Lo = Infinity, a1Hi = -Infinity, a2Lo = Infinity, a2Hi = -Infinity;
            for (const [a1, a2] of pts) {
                a1Lo = Math.min(a1Lo, a1); a1Hi = Math.max(a1Hi, a1);
                a2Lo = Math.min(a2Lo, a2); a2Hi = Math.max(a2Hi, a2);
            }
            const tight = divType === 'chisq' ? 0.15 : 0.3;
            const a1Pad = Math.max(1, (a1Hi - a1Lo) * tight);
            const a2Pad = Math.max(0.1, (a2Hi - a2Lo) * tight);
            const eta2Max = divType === 'chisq' ? -0.05 : -0.02;
            return [a1Lo - a1Pad, a1Hi + a1Pad, a2Lo - a2Pad, Math.min(eta2Max, a2Hi + a2Pad)];
        },
    },
    'mu-sigma': {
        label: 'μ, σ',
        formula: '\\textcolor{#7B2D8E}{q_\\phi}(x) = \\mathcal{N}(x;\\, \\mu,\\, \\sigma^2)',
        tooltip() { return 'Direct parameterization. The optimum is moment matching: μ* = 𝔼ₚ[x], σ* = √Varₚ(x). Simple and interpretable, but requires σ > 0 and the landscape is not globally convex.'; },
        axes: ['μ', 'σ'],
        fromQ(q) { return [q.mu, q.sigma]; },
        toQ(a1, a2, q) {
            q.mu = a1; q.logSigma = Math.log(Math.max(0.1, a2));
        },
        toMuSigma(a1, a2) { return [a1, Math.max(0.1, a2)]; },
        fromMuSigma(mu, sigma) { return [mu, sigma]; },
        transformGrad(gMu, gLs, q) { return [gMu, gLs / q.sigma]; },
        // F^{-1} = diag(σ², σ²/2)
        fisherInv(g1, g2, q) {
            const s2 = q.sigma * q.sigma;
            return [s2 * g1, s2 / 2 * g2];
        },
        hoverLabel(a1, a2) { return 'μ = ' + a1.toFixed(2) + '<br>σ = ' + a2.toFixed(2); },
        bounds(pComps, optFwd, optRev, qs, divType) {
            const pad = divType === 'chisq' ? 1.15 : 1.5;
            let sLo = 0.3, sHi = divType === 'chisq' ? 2 : 3;
            if (optFwd) {
                sLo = Math.min(sLo, optFwd.sigma * 0.5);
                sHi = Math.max(sHi, optFwd.sigma * pad);
            }
            for (const o of optRev) {
                sLo = Math.min(sLo, o.sigma * 0.5);
                sHi = Math.max(sHi, o.sigma * pad);
            }
            for (const c of pComps) sHi = Math.max(sHi, c.sigma * pad);
            for (const q of qs) {
                sLo = Math.min(sLo, q.sigma * 0.8);
                sHi = Math.max(sHi, q.sigma * 1.2);
            }
            return [X_MIN, X_MAX, Math.max(0.1, sLo), sHi];
        },
    },
    'mu-logsigma': {
        label: 'μ, log σ',
        formula: '\\textcolor{#7B2D8E}{q_\\phi}(x) = \\mathcal{N}(x;\\, \\mu,\\, e^{2\\log\\sigma})',
        tooltip() { return 'The standard ML parameterization (VAEs, normalizing flows). Unconstrained: φ ∈ ℝ², no positivity constraints needed. Still non-convex, but log σ compresses the large-σ region where non-convexity lives.'; },
        axes: ['μ', 'log σ'],
        fromQ(q) { return [q.mu, q.logSigma]; },
        toQ(a1, a2, q) { q.mu = a1; q.logSigma = a2; },
        toMuSigma(a1, a2) { return [a1, Math.exp(a2)]; },
        fromMuSigma(mu, sigma) { return [mu, Math.log(sigma)]; },
        transformGrad(gMu, gLs, _q) { return [gMu, gLs]; },
        // F^{-1} = diag(σ², 1/2)
        fisherInv(g1, g2, q) { return [q.sigma * q.sigma * g1, g2 / 2]; },
        hoverLabel(a1, a2) { return 'μ = ' + a1.toFixed(2) + '<br>log σ = ' + a2.toFixed(2); },
        bounds(pComps, optFwd, optRev, qs, divType) {
            const pad = divType === 'chisq' ? 0.3 : 0.5;
            let lsLo = -0.5, lsHi = divType === 'chisq' ? 0.8 : 1.5;
            if (optFwd) {
                lsLo = Math.min(lsLo, Math.log(optFwd.sigma) - pad);
                lsHi = Math.max(lsHi, Math.log(optFwd.sigma) + pad);
            }
            for (const o of optRev) {
                lsLo = Math.min(lsLo, Math.log(o.sigma) - pad);
                lsHi = Math.max(lsHi, Math.log(o.sigma) + pad);
            }
            for (const c of pComps) lsHi = Math.max(lsHi, Math.log(c.sigma) + pad);
            for (const q of qs) {
                lsLo = Math.min(lsLo, q.logSigma - 0.3);
                lsHi = Math.max(lsHi, q.logSigma + 0.3);
            }
            return [X_MIN, X_MAX, lsLo, lsHi];
        },
    },
    'mu-tau': {
        label: 'μ, τ',
        formula: '\\textcolor{#7B2D8E}{q_\\phi}(x) \\propto \\sqrt{\\tau}\\,\\exp\\!\\bigl({-}\\tfrac{\\tau}{2}(x{-}\\mu)^2\\bigr)',
        tooltip() { return 'Precision parameterization: τ = 1/σ². Since η₂ = −τ/2, τ is linear in one natural parameter. But η₁ = μτ is bilinear in (μ,τ), so the joint map is nonlinear — partial linearity is not enough for convexity.'; },
        axes: ['μ', 'τ'],
        fromQ(q) { return [q.mu, 1 / (q.sigma * q.sigma)]; },
        toQ(a1, a2, q) {
            a2 = Math.max(0.04, a2);  // σ < 5
            q.mu = a1; q.logSigma = -0.5 * Math.log(a2);
        },
        toMuSigma(a1, a2) { a2 = Math.max(0.04, a2); return [a1, 1 / Math.sqrt(a2)]; },
        fromMuSigma(mu, sigma) { return [mu, 1 / (sigma * sigma)]; },
        transformGrad(gMu, gLs, q) {
            const s2 = q.sigma * q.sigma;
            return [gMu, -gLs * s2 / 2];
        },
        // F^{-1} = diag(1/τ, 2τ²) = diag(σ², 2/σ⁴)
        fisherInv(g1, g2, q) {
            const s2 = q.sigma * q.sigma;
            return [s2 * g1, 2 * g2 / (s2 * s2)];
        },
        hoverLabel(a1, a2) { return 'μ = ' + a1.toFixed(2) + '<br>τ = ' + a2.toFixed(2); },
        bounds(pComps, optFwd, optRev, qs, divType) {
            const pad = divType === 'chisq' ? 1.15 : 1.5;
            let tLo = 0.2, tHi = 3;
            if (optFwd) {
                const t = 1 / (optFwd.sigma * optFwd.sigma);
                tLo = Math.min(tLo, t * 0.5); tHi = Math.max(tHi, t * pad);
            }
            for (const o of optRev) {
                const t = 1 / (o.sigma * o.sigma);
                tLo = Math.min(tLo, t * 0.5); tHi = Math.max(tHi, t * pad);
            }
            for (const c of pComps) {
                const t = 1 / (c.sigma * c.sigma);
                tLo = Math.min(tLo, t * 0.5); tHi = Math.max(tHi, t * pad);
            }
            for (const q of qs) {
                const t = 1 / (q.sigma * q.sigma);
                tLo = Math.min(tLo, t * 0.7); tHi = Math.max(tHi, t * 1.3);
            }
            const tLoFloor = divType === 'chisq' ? 0.1 : 0.04;
            return [X_MIN, X_MAX, Math.max(tLoFloor, tLo), tHi];
        },
    },
};

// The currently selected parameterization.
export function curP() { return PARAMS[S.landParam]; }

// Thin wrappers over the current parameterization — keep call sites short.
export function qToLand(q) { return curP().fromQ(q); }
export function setQFromLand(a1, a2, q) { curP().toQ(a1, a2, q); }
export function landToMuSigma(a1, a2) { return curP().toMuSigma(a1, a2); }
export function muSigmaToLand(mu, sigma) { return curP().fromMuSigma(mu, sigma); }
export function transformGrad(g1, g2, q) { return curP().transformGrad(g1, g2, q); }
