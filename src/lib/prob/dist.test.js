import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    log2, erfc, gMass, numEntropy, gPdf, mixDist, unifDist, BIMODAL,
    family, quantH, softmax, shannonH, quantile,
    temper, withProb, withMass, familyShape, shapeDist, shapeMoments, rescaleShape, setPeak, setWeight, MIN_W,
    stepsDist, setBreak, setLevel, MIN_WIDTH,
    cdfOf, discCdfAt, discQuantile, sampleShape, atX, atU, lerp, runningIntegral,
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

const sum = a => a.reduce((x, y) => x + y, 0);

describe('temper', () => {
    it('is the identity at beta = 1 and uniform at beta = 0', () => {
        const p = [0.5, 0.3, 0.2];
        temper(p, 1).forEach((v, i) => close(v, p[i], 1e-12));
        temper(p, 0).forEach(v => close(v, 1 / 3, 1e-12));
    });
    it('is uniform on the argmax(es) at beta = infinity', () => {
        assert.deepEqual(temper([0.2, 0.5, 0.3], Infinity), [0, 1, 0]);
        assert.deepEqual(temper([0.4, 0.2, 0.4], Infinity), [0.5, 0, 0.5]);
    });
    it('tempering a softmax scales its logits', () => {
        const L = [1.9, 0.2, 1.1, -0.6];
        const a = temper(softmax(L, 1), 2.5), b = softmax(L, 2.5);
        a.forEach((v, i) => close(v, b[i], 1e-12));
    });
});

describe('withProb', () => {
    it('hits the target, sums to 1, keeps the others in proportion', () => {
        const p = [0.1, 0.2, 0.3, 0.4];
        const q = withProb(p, 1, 0.5, 0.01);
        close(q[1], 0.5, 1e-12);
        close(sum(q), 1, 1e-12);
        close(q[3] / q[2], 4 / 3, 1e-12);
    });
    it('respects the floor', () => {
        const q = withProb([0.25, 0.25, 0.25, 0.25], 0, 1, 0.02);
        q.forEach(v => assert.ok(v >= 0.02 - 1e-12));
        close(sum(q), 1, 1e-12);
    });
});

describe('editable shapes', () => {
    it('familyShape matches family()', () => {
        for (const fam of ['gauss', 'unif', 'bimodal']) {
            close(shapeDist(familyShape(fam, 0.3)).h, family(fam, 0.3).h, 1e-9, fam);
            close(shapeMoments(familyShape(fam, 0.3)).sd, 0.3, 1e-12, fam);
        }
    });
    it('rescaleShape sets the sd, keeps the mean, and shifts h by log2 of the factor', () => {
        const s0 = { kind: 'mix', comps: [{ w: .3, m: -1, s: .2 }, { w: .7, m: 2, s: .5 }] };
        const s1 = rescaleShape(s0, 3 * shapeMoments(s0).sd);
        close(shapeMoments(s1).sd, 3 * shapeMoments(s0).sd, 1e-12);
        close(shapeMoments(s1).mean, shapeMoments(s0).mean, 1e-12);
        close(shapeDist(s1).h - shapeDist(s0).h, log2(3), 1e-4);
    });
    it('setPeak puts the mixture density at the new mean equal to y', () => {
        const comps = [{ w: .6, m: 0, s: .3 }, { w: .4, m: 1, s: .4 }];
        const c = setPeak(comps, 0, 0.2, 1.7);
        close(c[0].m, 0.2, 1e-12);
        close(mixDist(c).pdf(0.2), 1.7, 1e-9);
        assert.deepEqual(c[1], comps[1]);
    });
    it('setWeight sets one weight, rescales the rest to sum 1, and keeps m and s', () => {
        const comps = [{ w: .6, m: 0, s: .3 }, { w: .3, m: 1, s: .4 }, { w: .1, m: 2, s: .5 }];
        const c = setWeight(comps, 0, 0.2);
        close(c[0].w, 0.2, 1e-12);
        close(c[1].w, 0.6, 1e-12); close(c[2].w, 0.2, 1e-12); // the others keep their 3:1 ratio
        c.forEach((k, j) => { assert.equal(k.m, comps[j].m); assert.equal(k.s, comps[j].s); });
        close(setWeight(comps, 1, 1.5)[1].w, 1 - MIN_W, 1e-12); // clamped: no bump vanishes
    });
    it('h stays accurate for a narrow component far from a wide one', () => {
        // two well-separated components: h = sum w_i h_i + H(w)
        const comps = [{ w: .5, m: -20, s: .01 }, { w: .5, m: 20, s: 2 }];
        const hi = s => 0.5 * log2(2 * Math.PI * Math.E * s * s);
        close(mixDist(comps).h, .5 * hi(.01) + .5 * hi(2) + 1, 1e-3);
    });
});

describe('step densities', () => {
    const shape = { kind: 'steps', ts: [-1, -0.2, 0.1, 0.9, 2], ms: [0.1, 0.4, 0.3, 0.2] };
    const d = stepsDist(shape.ts, shape.ms);
    it('integrates to 1 and has the closed-form h', () => {
        close(d.mass(-5, 5), 1, 1e-12);
        close(numEntropy(d.pdf, -1, 2, 300000), d.h, 1e-3);
        const H = shannonH(shape.ms), Elogw = shape.ms.reduce((t, m, i) => t + m * log2(d.ws[i]), 0);
        close(d.h, H + Elogw, 1e-12);
    });
    it('quantizing on the chunk grid gives exactly H(m) = h + log2(1/Δ) for equal widths', () => {
        // chunks of width 1/2 that coincide with the bins [(k - 1/2)Δ, (k + 1/2)Δ], Δ = 1/2
        const m = [0.2, 0.5, 0.3];
        const aligned = stepsDist([-0.25, 0.25, 0.75, 1.25], m);
        close(quantH(aligned, 0.5), shannonH(m), 1e-12);
        close(aligned.h, shannonH(m) - 1, 1e-12);
    });
    it('moments match numerical integration', () => {
        const N = 200000;
        let mean = 0;
        for (let i = 0; i < N; i++) { const x = -1 + 3 * (i + .5) / N; mean += x * d.pdf(x) * 3 / N; }
        close(shapeMoments(shape).mean, mean, 1e-4);
        const { sd } = shapeMoments(shape);
        close(shapeMoments(rescaleShape(shape, 2 * sd)).sd, 2 * sd, 1e-12);
    });
    it('the uniform preset is one chunk with h = log2 w', () => {
        const u = familyShape('unif', 1);
        assert.equal(u.ms.length, 1);
        close(shapeDist(u).h, log2(Math.sqrt(12)), 1e-12);
    });
    it('the step preset has the requested sd and mean 0', () => {
        const st = familyShape('steps', 0.3);
        close(shapeMoments(st).sd, 0.3, 1e-12);
        close(shapeMoments(st).mean, 0, 1e-12);
    });
    it('setBreak keeps masses and chunk order', () => {
        const s1 = setBreak(shape, 2, 5); // pushed past its right neighbour: clamped
        assert.deepEqual(s1.ms, shape.ms);
        close(s1.ts[2], shape.ts[3] - MIN_WIDTH, 1e-12);
        const s2 = setBreak(shape, 0, -3);   // outer edge moves freely outward
        close(s2.ts[0], -3, 1e-12);
    });
    it('setLevel hits the target height and stays normalized', () => {
        const s1 = setLevel(shape, 1, 1.5);
        const d1 = shapeDist(s1);
        close(d1.hs[1], 1.5, 1e-12);
        close(s1.ms.reduce((a, b) => a + b, 0), 1, 1e-12);
    });
});

describe('sampled helpers', () => {
    it('discrete CDF and generalized inverse satisfy F⁻¹(u) ≤ x ⟺ u ≤ F(x)', () => {
        const p = [0.1, 0.4, 0.2, 0.3], F = cdfOf(p);
        assert.deepEqual(F.map(v => +v.toFixed(12)), [0, 0.1, 0.5, 0.7, 1]);
        for (let i = 0; i < 500; i++) {
            const u = Math.random(), x = 0.5 + Math.random() * 4;
            assert.equal(discQuantile(F, u) <= x + 1e-12, u <= discCdfAt(F, x) + 1e-12);
        }
        assert.equal(discQuantile(F, 0), 0);
        assert.equal(discQuantile(F, 0.1), 1);      // closed at the block's end
        assert.equal(discQuantile(F, 0.1000001), 2);
    });
    it('sampled CDF is monotone and ends at 1, for mixtures and steps', () => {
        for (const shape of [familyShape('gauss', 0.2), familyShape('bimodal', 0.3),
            { kind: 'steps', ts: [-.55, -.3, -.1, .1, .3, .55], ms: [.1, .28, .34, .18, .1] }]) {
            const S = sampleShape(shape);
            for (let i = 1; i < S.Fs.length; i++) assert.ok(S.Fs[i] >= S.Fs[i - 1] - 1e-12);
            close(S.Fs[S.Fs.length - 1], 1, 1e-6);
        }
    });
    it('quantile and CDF invert each other through the samples', () => {
        const S = sampleShape(familyShape('gauss', 0.2));
        const x = lerp(S.xs, atU(S, 0.3));
        close(x, 0.2 * -0.5244005, 1e-3);
        close(lerp(S.Fs, atX(S, x)), 0.3, 1e-4);
    });
    it('running integral of −log f recovers h, and of 1 gives u', () => {
        const S = sampleShape(familyShape('gauss', 0.2));
        const I = runningIntegral(S.Fs, S.fs.map(f => -log2(f)));
        close(I[I.length - 1], 0.5 * log2(2 * Math.PI * Math.E * 0.04), 1e-3);
        const one = runningIntegral(S.Fs, S.fs.map(() => 1));
        close(one[one.length - 1], 1, 1e-9);
    });
});

describe('withMass (a pmf edit that may reach zero)', () => {
    const sum = a => a.reduce((x, y) => x + y, 0);
    it('hits the target exactly and keeps the others in proportion', () => {
        const q = withMass([0.1, 0.2, 0.3, 0.4], 1, 0.5, 0.03);
        assert.ok(Math.abs(q[1] - 0.5) < 1e-12);
        assert.ok(Math.abs(q[2] / q[0] - 3) < 1e-12 && Math.abs(q[3] / q[0] - 4) < 1e-12);
        assert.ok(Math.abs(sum(q) - 1) < 1e-12);
    });
    it('pops to zero below the snap', () => {
        const q = withMass([0.25, 0.25, 0.25, 0.25], 2, 0.02, 0.03);
        assert.equal(q[2], 0);
        assert.ok(Math.abs(sum(q) - 1) < 1e-12);
        assert.equal(withMass([0.25, 0.25, 0.25, 0.25], 2, -1, 0.03)[2], 0);
    });
    it('lowering the only atom with mass spreads the rest evenly over the others', () => {
        assert.deepEqual(withMass([0, 0, 1, 0], 2, 0.4, 0.03).map(v => +v.toFixed(12)), [0.2, 0.2, 0.4, 0.2]);
    });
    it('raising a zero atom takes mass from the others in proportion; zeros stay zero', () => {
        const q = withMass([0.5, 0, 0.5, 0], 1, 0.2, 0.03);
        assert.deepEqual(q.map(v => +v.toFixed(12)), [0.4, 0.2, 0.4, 0]);
    });
});
