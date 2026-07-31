import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_P, DEFAULT_K, defaultPrior, defaultValid } from './config.js';
import { normalize, withProb, solveAlpha, betaOfAlpha, epsBeta, anchoredOptimum } from './model.js';

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
