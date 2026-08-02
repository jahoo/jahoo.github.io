import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_P, DEFAULT_K, defaultPrior, defaultValid, defaultPhi } from './config.js';
import { normalize, withProb, solveAlpha, betaOfAlpha, epsBeta, anchoredOptimum, bernKL, bernKLPrime, fOfAlpha, fPrimeOfAlpha, contOptimum } from './model.js';

const sum = a => a.reduce((x, y) => x + y, 0);
const close = (a, b, tol = 1e-9) =>
    assert.ok(Math.abs(a - b) < tol, `expected ${a} ≈ ${b}`);

const prior = normalize(defaultPrior(DEFAULT_K));
const valid = defaultValid(DEFAULT_K);
const Z = prior.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);

test('solveAlpha satisfies the fixed-point pair', () => {
    for (const beta of [0.05, 0.3, 1, 5, 50]) {
        for (const z of [0.1, 0.3, 0.7, 0.95]) {
            const a = solveAlpha(z, beta);
            const eps = epsBeta(a, beta);
            close(a, z / (z + eps * (1 - z)), 1e-9);
            assert.ok(a > z && a < 1, `alpha in (Z, 1), got ${a}`);
        }
    }
});

test('beta -> 0 recovers the posterior (conditioning on V)', () => {
    const posterior = normalize(prior.map((p, i) => (valid[i] ? p : 0)));
    for (const beta of [0, 1e-6]) {
        const { q, alpha } = anchoredOptimum(prior, valid, beta);
        close(alpha, 1, 1e-6);
        q.forEach((v, i) => close(v, posterior[i], 1e-6));
    }
});

test('beta -> infinity recovers the prior', () => {
    for (const beta of [Infinity, 1e9]) {
        const { q, alpha } = anchoredOptimum(prior, valid, beta);
        close(alpha, Z, 1e-6);
        q.forEach((v, i) => close(v, prior[i], 1e-6));
    }
});

test('optimum is proportional to the prior within each block', () => {
    const { q, eps } = anchoredOptimum(prior, valid, 0.7);
    const ratioOn = q.map((v, i) => v / prior[i]).filter((_, i) => valid[i]);
    const ratioOff = q.map((v, i) => v / prior[i]).filter((_, i) => !valid[i]);
    ratioOn.forEach(r => close(r, ratioOn[0]));
    ratioOff.forEach(r => close(r, ratioOff[0]));
    // the relative level of the two blocks is exactly eps
    close(ratioOff[0] / ratioOn[0], eps);
});

test('mixture form: q = alpha * posterior + (1 - alpha) * prior(.|Vc)', () => {
    const posterior = normalize(prior.map((p, i) => (valid[i] ? p : 0)));
    const anti = normalize(prior.map((p, i) => (valid[i] ? 0 : p)));
    const { q, alpha } = anchoredOptimum(prior, valid, 0.4);
    q.forEach((v, i) =>
        close(v, alpha * posterior[i] + (1 - alpha) * anti[i]));
});

test('optimum is normalized with q(V) = alpha', () => {
    const { q, alpha } = anchoredOptimum(prior, valid, 1.3);
    close(sum(q), 1);
    close(q.reduce((s, v, i) => s + (valid[i] ? v : 0), 0), alpha);
});

test('degenerate masks fall back to the prior', () => {
    const allValid = anchoredOptimum(prior, prior.map(() => true), 0.5);
    close(allValid.alpha, 1);
    allValid.q.forEach((v, i) => close(v, prior[i]));
    const allInvalid = anchoredOptimum(prior, prior.map(() => false), 0.5);
    allInvalid.q.forEach((v, i) => close(v, prior[i]));
});

test('betaOfAlpha inverts solveAlpha', () => {
    for (const z of [0.1, 0.4, 0.8]) {
        for (const beta of [0.05, 0.5, 3, 40]) {
            const a = solveAlpha(z, beta);
            close(betaOfAlpha(z, a), beta, 1e-6 * beta);
        }
        assert.equal(betaOfAlpha(z, 1), 0);
        assert.equal(betaOfAlpha(z, z), Infinity);
    }
});

test('alpha is strictly decreasing in beta (for fixed Z)', () => {
    const betas = [0, 0.01, 0.1, 0.5, 2, 10, 100, Infinity];
    for (const z of [0.2, 0.6]) {
        const alphas = betas.map(b => solveAlpha(z, b));
        for (let i = 1; i < alphas.length; i++) {
            assert.ok(alphas[i] < alphas[i - 1] + 1e-12,
                `alpha not decreasing at beta = ${betas[i]}`);
        }
        close(alphas[0], 1);
        close(alphas[alphas.length - 1], z);
    }
});

test('defaults are sensible at every support size', () => {
    for (let kk = 2; kk <= 40; kk++) {
        const p = normalize(defaultPrior(kk));
        const v = defaultValid(kk);
        assert.equal(p.length, kk);
        assert.equal(v.length, kk);
        close(sum(p), 1);
        assert.ok(v.some(Boolean), `k=${kk}: needs a valid element`);
        assert.ok(v.some(x => !x), `k=${kk}: needs an invalid element`);
    }
});

test('withProb adapts to the array length', () => {
    const p5 = normalize(defaultPrior(5));
    const next = withProb(p5, 2, 0.9);
    close(sum(next), 1);
    close(next[2], 0.9, 1e-9);
    assert.equal(next.length, 5);
});

test('withProb sets the target and keeps the sum at 1', () => {
    const next = withProb(prior, 3, 0.4);
    close(sum(next), 1);
    close(next[3], 0.4, 1e-9);
    // clamped at both ends (upper clamp is approximate: flooring the
    // other entries at MIN_P shifts the final normalization slightly)
    const lo = withProb(prior, 0, -1);
    close(sum(lo), 1);
    assert.ok(lo[0] <= MIN_P * 1.01, `low clamp, got ${lo[0]}`);
    const hi = withProb(prior, 0, 2);
    close(sum(hi), 1);
    assert.ok(hi[0] >= 0.9, `high clamp, got ${hi[0]}`);
    assert.ok(hi.every(v => v > 0), 'no zeros after clamping');
});

test('bernKL is the Bernoulli KL, finite at the endpoints', () => {
    close(bernKL(0.3, 0.3), 0);
    close(bernKL(1, 0.3), Math.log(1 / 0.3));
    close(bernKL(0, 0.3), Math.log(1 / 0.7));
    close(bernKL(0.6, 0.2),
        0.6 * Math.log(0.6 / 0.2) + 0.4 * Math.log(0.4 / 0.8));
});

test('fPrimeOfAlpha is the derivative of fOfAlpha', () => {
    const h = 1e-6;
    for (const z of [0.2, 0.6]) {
        for (const beta of [0, 0.4, 3]) {
            for (const a of [0.05, 0.3, 0.62, 0.9]) {
                const num = (fOfAlpha(z, beta, a + h)
                    - fOfAlpha(z, beta, a - h)) / (2 * h);
                close(fPrimeOfAlpha(z, beta, a), num, 1e-4);
            }
        }
    }
});

test('fPrimeOfAlpha vanishes at the solveAlpha root', () => {
    for (const z of [0.1, 0.3, 0.7]) {
        for (const beta of [0.05, 0.5, 2, 20]) {
            const a = solveAlpha(z, beta);
            close(fPrimeOfAlpha(z, beta, a), 0, 1e-6);
        }
    }
});

test('fOfAlpha is minimized at the solveAlpha root', () => {
    for (const z of [0.15, 0.5]) {
        for (const beta of [0.1, 1, 10]) {
            const fmin = fOfAlpha(z, beta, solveAlpha(z, beta));
            for (let i = 1; i < 100; i++) {
                const v = fOfAlpha(z, beta, i / 100);
                assert.ok(v >= fmin - 1e-9,
                    `f(${i / 100}) = ${v} below f(alpha_beta) = ${fmin}`);
            }
        }
    }
});

test('fOfAlpha is finite at alpha = 1', () => {
    close(fOfAlpha(0.3, 2, 1), 2 * Math.log(1 / 0.3));
});

test('bernKLPrime is the derivative of bernKL', () => {
    const h = 1e-6;
    for (const z of [0.2, 0.6]) {
        for (const a of [0.05, 0.3, 0.62, 0.9]) {
            const num = (bernKL(a + h, z) - bernKL(a - h, z)) / (2 * h);
            close(bernKLPrime(a, z), num, 1e-4);
        }
    }
});

test('fPrimeOfAlpha and bernKLPrime are strictly increasing in alpha', () => {
    for (const z of [0.1, 0.3, 0.7]) {
        for (const beta of [0, 0.05, 0.5, 2, 20]) {
            for (let i = 1; i < 99; i++) {
                const a = i / 100;
                assert.ok(fPrimeOfAlpha(z, beta, a) < fPrimeOfAlpha(z, beta, a + 0.01),
                    `f' not increasing at z=${z}, beta=${beta}, a=${a}`);
            }
        }
        for (let i = 1; i < 99; i++) {
            const a = i / 100;
            assert.ok(bernKLPrime(a, z) < bernKLPrime(a + 0.01, z),
                `bernKL' not increasing at z=${z}, a=${a}`);
        }
    }
});

const phiRamp = defaultPhi(DEFAULT_K);

test('defaultPhi is a skewed notch strictly inside (0, 1)', () => {
    for (let kk = 2; kk <= 40; kk++) {
        const f = defaultPhi(kk);
        assert.equal(f.length, kk);
        f.forEach(v => assert.ok(v > 0 && v < 1, `phi in (0,1), got ${v}`));
    }
    // the shape (for k big enough to resolve it): starts high, dips to an
    // interior minimum past the middle, recovers only partway
    for (const kk of [8, 10, 25, 40]) {
        const f = defaultPhi(kk);
        const iMin = f.indexOf(Math.min(...f));
        const c = iMin / (kk - 1);
        assert.ok(c > 0.4 && c < 0.8, `notch skewed past center, got ${c}`);
        for (let i = 1; i <= iMin; i++) {
            assert.ok(f[i] < f[i - 1], `decreasing into the notch at ${i}`);
        }
        for (let i = iMin + 1; i < kk; i++) {
            assert.ok(f[i] > f[i - 1], `recovering after the notch at ${i}`);
        }
        assert.ok(f[0] > 0.9, `top near 1, got ${f[0]}`);
        assert.ok(f[kk - 1] < f[0] - 0.3, `asymmetric recovery, got ${f[kk - 1]}`);
    }
});

test('contOptimum with binary phi recovers anchoredOptimum', () => {
    const phi = valid.map(v => (v ? 1 : 0));
    for (const beta of [0.05, 0.5, 2, 20]) {
        const bin = anchoredOptimum(prior, valid, beta);
        const cont = contOptimum(prior, phi, beta);
        cont.q.forEach((v, i) => close(v, bin.q[i], 1e-6));
        close(cont.eps, bin.eps, 1e-6);
        close(cont.Z, bin.Z, 1e-9);
    }
});

test('contOptimum endpoints: posterior at beta = 0, prior at beta = infinity', () => {
    const posterior = normalize(prior.map((p, i) => p * phiRamp[i]));
    contOptimum(prior, phiRamp, 0).q.forEach((v, i) => close(v, posterior[i], 1e-9));
    contOptimum(prior, phiRamp, Infinity).q.forEach((v, i) => close(v, prior[i], 1e-9));
    // the limits are approached continuously
    contOptimum(prior, phiRamp, 1e-4).q.forEach((v, i) => close(v, posterior[i], 1e-3));
    contOptimum(prior, phiRamp, 1e5).q.forEach((v, i) => close(v, prior[i], 1e-3));
});

test('contOptimum is normalized and satisfies stationarity', () => {
    for (const beta of [0.1, 1, 10]) {
        const { q, c, Z } = contOptimum(prior, phiRamp, beta);
        close(sum(q), 1, 1e-9);
        // phi_i = Z * r_i * (beta*log r_i + c) at the solution
        q.forEach((v, i) => {
            const r = v / prior[i];
            close(phiRamp[i], Z * r * (beta * Math.log(r) + c), 1e-5);
        });
    }
});

test('softened potential is monotone, floored at eps, topped at 1', () => {
    for (const beta of [0.1, 1, 10]) {
        const { softened, eps } = contOptimum(prior, phiRamp, beta);
        close(softened(0), eps, 1e-9);
        close(softened(1), 1, 1e-9);
        assert.ok(eps > 0 && eps < 1, `floor in (0,1), got ${eps}`);
        let prev = -1;
        for (let i = 0; i <= 50; i++) {
            const v = softened(i / 50);
            assert.ok(v >= prev - 1e-12, `softened monotone at ${i / 50}`);
            prev = v;
        }
    }
});

test('contOptimum degenerate all-zero phi falls back to the prior', () => {
    const zero = prior.map(() => 0);
    contOptimum(prior, zero, 0.5).q.forEach((v, i) => close(v, prior[i]));
});

test('contOptimum is sane across the whole reachable input space', () => {
    for (const kk of [2, 40]) {
        const p = normalize(defaultPrior(kk));
        const f = defaultPhi(kk);
        for (const beta of [0, 0.01, 1, 100, Infinity]) {
            const { q } = contOptimum(p, f, beta);
            close(sum(q), 1, 1e-9);
            q.forEach(v => assert.ok(Number.isFinite(v) && v >= 0));
        }
    }
});
