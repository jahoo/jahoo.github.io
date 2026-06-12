// Regression tests for the reverse-divergence minima markers (S.optRev).
//
// The bug these guard against: the markers were found by a bounded
// fixed-step gradient descent that under-converged in broad flat valleys,
// so the marked "minimum" could sit well away from where the live
// optimizer actually settles (and away from the true minimum). See
// `optimizeGeneric` in algorithms.js.
//
// Core invariant asserted here: every marker is a *fixed point* of the
// live deterministic optimizer — i.e. starting the live fit exactly at a
// marker, it stays put. A mislocated marker fails this.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { S, resetAdam } from './state.js';
import {
    computeOptimal, computeLandscapes,
    stepReverseKL_deterministic, stepReverseChisq_deterministic,
} from './algorithms.js';

const makeQ = (mu, sigma) => ({ mu, logSigma: Math.log(sigma), get sigma() { return Math.exp(this.logSigma); } });
const dist = (a, b) => Math.hypot(a.mu - b.mu, a.sigma - b.sigma);

// Run the live deterministic reverse optimizer from a start; return where it settles.
function liveSettle(divType, startMu, startSigma, steps = 6000) {
    S.divergenceType = divType;
    S.landParam = 'mu-sigma';
    S.natGrad = true;
    S.gradClip = true;
    S.baseLR = 0.08;
    S.qRev = makeQ(startMu, startSigma);
    resetAdam();
    const step = divType === 'chisq' ? stepReverseChisq_deterministic : stepReverseKL_deterministic;
    for (let i = 0; i < steps; i++) step();
    return { mu: S.qRev.mu, sigma: S.qRev.sigma };
}

// Compute the markers for a given target + divergence.
function markersFor(pComps, divType) {
    S.pComps = pComps.map(c => ({ ...c }));
    S.divergenceType = divType;
    S.landParam = 'mu-sigma';
    S.natGrad = true;
    S.gradClip = true;
    computeOptimal();
    computeLandscapes();
    return S.optRev.map(o => ({ mu: o.mu, sigma: o.sigma, kl: o.kl }));
}

// Every marker must be a fixed point of the live optimizer.
function assertMarkersAreFixedPoints(pComps, divType, tol = 0.05) {
    const markers = markersFor(pComps, divType);
    assert.ok(markers.length >= 1, `${divType}: expected at least one marker`);
    for (const m of markers) {
        const settled = liveSettle(divType, m.mu, m.sigma);
        assert.ok(dist(m, settled) < tol,
            `${divType}: marker (${m.mu.toFixed(3)}, ${m.sigma.toFixed(3)}) is not a fixed point — ` +
            `live optimizer drifts to (${settled.mu.toFixed(3)}, ${settled.sigma.toFixed(3)})`);
    }
    return markers;
}

// The exact target from the reported bug report (broad, overlapping modes;
// the reverse-KL global is a single broad covering Gaussian between them).
const P_BROAD = [
    { mu: -2.2095238095238097, sigma: 1.36, w: 0.5 },
    { mu: 3.390476190476191, sigma: 2.0066666666666664, w: 0.5 },
];

// The app's default target: narrower, well-separated modes.
const P_SEPARATED = [
    { mu: -3, sigma: 0.9, w: 0.5 },
    { mu: 2, sigma: 0.7, w: 0.5 },
];

describe('reverse-KL markers (broad covering case — the reported bug)', () => {
    it('global marker sits at the true covering minimum, not short of it', () => {
        const markers = markersFor(P_BROAD, 'kl');
        const global = markers[0];
        // True minimum (verified by fine-quadrature brute force): (0.947, 3.042).
        assert.ok(dist(global, { mu: 0.9469, sigma: 3.0424 }) < 0.05,
            `global marker at (${global.mu.toFixed(3)}, ${global.sigma.toFixed(3)})`);
        // The old buggy marker landed near (0.570, 2.857) — make sure we moved off it.
        assert.ok(dist(global, { mu: 0.5703, sigma: 2.8572 }) > 0.2,
            'global marker is still at the old under-converged location');
        // This target has a single reverse-KL minimum — no spurious extras.
        assert.equal(markers.length, 1, `expected 1 marker, got ${markers.length}`);
    });

    it('marker is a fixed point of the live optimizer', () => {
        assertMarkersAreFixedPoints(P_BROAD, 'kl');
    });
});

describe('reverse-KL markers (separated modes — distinct minima preserved)', () => {
    it('keeps the per-mode minima and they are fixed points', () => {
        const markers = assertMarkersAreFixedPoints(P_SEPARATED, 'kl');
        // Both mode-seeking minima must be present (not collapsed into one).
        assert.ok(markers.some(m => dist(m, { mu: -3, sigma: 0.9 }) < 0.2), 'left-mode minimum missing');
        assert.ok(markers.some(m => dist(m, { mu: 2, sigma: 0.7 }) < 0.2), 'right-mode minimum missing');
    });
});

describe('reverse-χ² markers', () => {
    it('markers are fixed points for the broad case', () => {
        assertMarkersAreFixedPoints(P_BROAD, 'chisq');
    });
    it('markers are fixed points for the separated case', () => {
        const markers = assertMarkersAreFixedPoints(P_SEPARATED, 'chisq');
        assert.ok(markers.some(m => dist(m, { mu: -3, sigma: 0.9 }) < 0.2), 'left-mode χ² minimum missing');
        assert.ok(markers.some(m => dist(m, { mu: 2, sigma: 0.7 }) < 0.2), 'right-mode χ² minimum missing');
    });
});
