import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    log2, erfc, gMass, numEntropy, gPdf, mixDist, unifDist, BIMODAL,
    family, quantH, softmax, shannonH, quantile,
} from './dist.js';

const close = (a, b, tol, msg) =>
    assert.ok(Math.abs(a - b) < tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

describe('erfc', () => {
    it('matches known values', () => {
        close(erfc(0), 1, 1e-7);
        close(erfc(1), 0.157299207050285, 1e-7);
        close(erfc(-1), 1.842700792949715, 1e-7);
    });
});

describe('gMass', () => {
    it('gives the whole line mass 1 and a symmetric interval its known mass', () => {
        close(gMass(-40, 40, 0, 1), 1, 1e-7);
        close(gMass(-1, 1, 0, 1), 0.682689492137086, 1e-6);
    });
    it('agrees between the Simpson and erfc branches', () => {
        // width 0.4s (single-panel Simpson, error ~2e-6 here) vs a
        // difference of two wide erfc-branch masses
        close(gMass(0.3, 0.7, 0, 1), gMass(-10, 0.7, 0, 1) - gMass(-10, 0.3, 0, 1), 1e-5);
    });
});

describe('differential entropy', () => {
    it('Gaussian closed form matches numerical integration', () => {
        for (const s of [0.05, 0.5, 3]) {
            const h = 0.5 * log2(2 * Math.PI * Math.E * s * s);
            close(numEntropy(x => gPdf(x, 0, s), -12 * s, 12 * s), h, 1e-6, `s=${s}`);
            close(mixDist([{ w: 1, m: 0, s }]).h, h, 1e-12);
        }
    });
    it('uniform on [0, w] has h = log2 w', () => {
        close(unifDist(0, 0.25).h, -2, 1e-12);
        close(unifDist(0, 4).h, 2, 1e-12);
    });
    it('scales as h(aX) = h(X) + log2 a', () => {
        for (const fam of ['gauss', 'unif', 'bimodal']) {
            close(family(fam, 2).h - family(fam, 1).h, 1, 1e-5, fam);
        }
    });
    it('Gaussian has the largest h at fixed standard deviation', () => {
        const g = family('gauss', 1).h;
        assert.ok(family('unif', 1).h < g);
        assert.ok(family('bimodal', 1).h < g);
    });
    it('BIMODAL is standardized', () => {
        const mu = BIMODAL.reduce((t, k) => t + k.w * k.m, 0);
        const v = BIMODAL.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mu * mu;
        close(mu, 0, 1e-12);
        close(v, 1, 1e-12);
    });
});

describe('quantH', () => {
    it('approaches h + log2(1/Δ) for small Δ', () => {
        for (const fam of ['gauss', 'unif', 'bimodal']) {
            const d = family(fam, 0.5), D = 2 ** -10;
            close(quantH(d, D), d.h + 10, 2e-3, fam);
        }
    });
    it('is never negative, and is ~0 once the mass fits in one bin', () => {
        const d = family('gauss', 1 / 64);
        assert.ok(quantH(d, 1) >= 0);
        close(quantH(d, 1), 0, 1e-6);
        assert.ok(d.h < 0);
    });
});

describe('discrete helpers', () => {
    it('softmax at beta = 0 is uniform with entropy log2 n', () => {
        const p = softmax([1.9, 0.2, 1.1, -0.6, 0.7, -1.3, 0.1, -0.3], 0);
        close(shannonH(p), 3, 1e-12);
    });
    it('shannonH ignores zeros and is 0 for a point mass', () => {
        close(shannonH([1, 0, 0]), 0, 1e-12);
    });
    it('quantile inverts the cdf', () => {
        const d = family('gauss', 1);
        close(quantile(d, 0.5), 0, 1e-6);
        close(d.cdf(quantile(d, 0.25)), 0.25, 1e-6);
    });
});
