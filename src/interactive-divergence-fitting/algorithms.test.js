import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    gaussPdf, gaussLogPdf, mixturePdf, mixtureLogPdf, softmax, integrate, fmtNum,
} from './mathutils.js';
import { PARAMS } from './parameterizations.js';
import { S, resetAdam } from './state.js';
import {
    computeOptimal, klEval, chisqEval, divForward, divReverse,
    stepForwardKL_deterministic,
} from './algorithms.js';

// A fitted Gaussian with the same sigma getter the app uses.
const makeQ = (mu, logSigma) => ({ mu, logSigma, get sigma() { return Math.exp(this.logSigma); } });

// Reset the shared state to a known KL configuration before a test.
function setupKL(pComps, q) {
    S.pComps = pComps;
    S.divergenceType = 'kl';
    S.gradientMode = 'deterministic';
    S.landParam = 'mu-logsigma';
    S.natGrad = true;
    S.gradClip = true;
    S.baseLR = 0.08;
    S.K = 64;
    S.qFwd = q;
    S.qRev = makeQ(q.mu, q.logSigma);
    resetAdam();
    computeOptimal();
}

describe('mathutils', () => {
    it('gaussPdf integrates to ~1', () => {
        const I = integrate(x => gaussPdf(x, 0.5, 1.3), -20, 20, 4000);
        assert.ok(Math.abs(I - 1) < 1e-4, `integral was ${I}`);
    });

    it('gaussLogPdf is the log of gaussPdf', () => {
        for (const x of [-2, 0, 1.7]) {
            assert.ok(Math.abs(gaussLogPdf(x, 0.2, 0.9) - Math.log(gaussPdf(x, 0.2, 0.9))) < 1e-12);
        }
    });

    it('mixtureLogPdf is the log of mixturePdf', () => {
        const comps = [{ mu: -3, sigma: 0.9, w: 0.5 }, { mu: 2, sigma: 0.7, w: 0.5 }];
        for (const x of [-4, -1, 0, 3]) {
            assert.ok(Math.abs(mixtureLogPdf(x, comps) - Math.log(mixturePdf(x, comps))) < 1e-10);
        }
    });

    it('softmax sums to 1 and is shift-invariant', () => {
        const a = softmax([1, 2, 3]);
        const b = softmax([101, 102, 103]);
        let s = 0;
        for (let i = 0; i < a.length; i++) { s += a[i]; assert.ok(Math.abs(a[i] - b[i]) < 1e-12); }
        assert.ok(Math.abs(s - 1) < 1e-12);
    });

    it('fmtNum handles the infinities', () => {
        assert.equal(fmtNum(Infinity), '∞');
        assert.equal(fmtNum(-Infinity), '−∞');
    });
});

describe('parameterizations round-trips', () => {
    const mu = 1.0, sigma = 1.5;
    for (const key of Object.keys(PARAMS)) {
        it(`${key}: fromQ ∘ toQ recovers (mu, sigma)`, () => {
            const P = PARAMS[key];
            const [a1, a2] = P.fromQ(makeQ(mu, Math.log(sigma)));
            const q2 = makeQ(0, 0);
            P.toQ(a1, a2, q2);
            assert.ok(Math.abs(q2.mu - mu) < 1e-9, `mu: ${q2.mu}`);
            assert.ok(Math.abs(q2.sigma - sigma) < 1e-9, `sigma: ${q2.sigma}`);
        });
        it(`${key}: fromMuSigma ∘ toMuSigma is consistent`, () => {
            const P = PARAMS[key];
            const [a1, a2] = P.fromMuSigma(mu, sigma);
            const [mu2, sigma2] = P.toMuSigma(a1, a2);
            assert.ok(Math.abs(mu2 - mu) < 1e-9 && Math.abs(sigma2 - sigma) < 1e-9);
        });
    }
});

describe('optimal solutions (forward KL = moment matching)', () => {
    it('matches the analytic mean and variance of the mixture', () => {
        const comps = [{ mu: -3, sigma: 0.9, w: 0.5 }, { mu: 2, sigma: 0.7, w: 0.5 }];
        setupKL(comps, makeQ(0, 0));
        const Ep = comps.reduce((a, c) => a + c.w * c.mu, 0);
        const Ep2 = comps.reduce((a, c) => a + c.w * (c.sigma * c.sigma + c.mu * c.mu), 0);
        const stdev = Math.sqrt(Ep2 - Ep * Ep);
        assert.ok(Math.abs(S.optFwd.mu - Ep) < 1e-9, `mu: ${S.optFwd.mu}`);
        assert.ok(Math.abs(S.optFwd.sigma - stdev) < 1e-9, `sigma: ${S.optFwd.sigma}`);
    });
});

describe('divergence evaluation', () => {
    const comps = [{ mu: -3, sigma: 0.9, w: 0.5 }, { mu: 2, sigma: 0.7, w: 0.5 }];

    it('KL is non-negative and is minimized at the moment-matched optimum', () => {
        setupKL(comps, makeQ(0, 0));
        const klOpt = klEval(S.optFwd.mu, S.optFwd.sigma, 'forward');
        const klBad = klEval(6, 0.5, 'forward');   // far-off mu, narrow sigma
        assert.ok(klOpt >= 0);
        assert.ok(klOpt < klBad, `opt ${klOpt} should beat bad ${klBad}`);
    });

    it('chi-square is non-negative', () => {
        S.pComps = comps;
        assert.ok(chisqEval(0, 1.2, 'forward') >= 0);
        assert.ok(chisqEval(0, 1.2, 'reverse') >= 0);
    });
});

describe('deterministic forward-KL descent', () => {
    it('reduces forward KL toward the optimum', () => {
        const comps = [{ mu: -3, sigma: 0.9, w: 0.5 }, { mu: 2, sigma: 0.7, w: 0.5 }];
        setupKL(comps, makeQ(6, Math.log(0.5)));   // start far from the optimum
        const klBefore = divForward();
        const klAtOpt = klEval(S.optFwd.mu, S.optFwd.sigma, 'forward');
        for (let i = 0; i < 4000; i++) stepForwardKL_deterministic();
        const klAfter = divForward();
        assert.ok(klAfter < klBefore, `KL did not decrease: ${klBefore} -> ${klAfter}`);
        assert.ok(klAfter < klAtOpt + 0.05, `KL ${klAfter} did not approach optimum ${klAtOpt}`);
        assert.ok(Math.abs(S.qFwd.mu - S.optFwd.mu) < 0.5, `mu ${S.qFwd.mu} vs opt ${S.optFwd.mu}`);
    });
});
