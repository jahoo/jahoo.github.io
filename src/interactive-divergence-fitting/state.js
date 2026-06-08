// ================================================================
//  Interactive divergence fitting — state.js
//  The single mutable state object shared across modules. Algorithm,
//  drawing, interaction and control modules all read/write `S.*`.
//  (ES module bindings can't be reassigned by importers, so reassigned
//  values — optima, landscape grids, Adam moments — live as properties
//  of this object rather than as exported `let`s.)
// ================================================================

import { LAND_RES } from './config.js';

// A fitted Gaussian stores (mu, logSigma); sigma is a derived getter.
function makeQ(mu, logSigma) {
    return { mu, logSigma, get sigma() { return Math.exp(this.logSigma); } };
}

function freshAdam() {
    return { mMu: 0, vMu: 0, mSig: 0, vSig: 0, t: 0 };
}

// q starts at a shared random position (same for both panels).
const _initMu = (Math.random() - 0.5) * 12;
const _initLs = Math.log(1 + Math.random() * 2);

export const S = {
    // Target p: a mixture of two Gaussians.
    pComps: [
        { mu: -3.0, sigma: 0.9, w: 0.5 },
        { mu: 2.0, sigma: 0.7, w: 0.5 },
    ],

    // Fitted distributions (one per panel).
    qFwd: makeQ(_initMu, _initLs),
    qRev: makeQ(_initMu, _initLs),

    // Mode / method selectors.
    reverseMethod: 'reinforce',  // 'reinforce' or 'reparam'
    gradientMode: 'mc',          // 'mc' or 'deterministic'
    divergenceType: 'kl',        // 'kl' or 'chisq'
    landParam: 'mu-sigma',       // key into the PARAMS registry
    natGrad: true,               // apply Fisher inverse to gradients
    gradClip: true,              // clip gradient norm (mitigates reverse χ² blowup)

    // Optimal solutions (recomputed when p changes).
    optFwd: null,   // { mu, sigma }
    optRev: [],     // [{ mu, sigma, kl }, ...]

    // Optimizer settings / run state.
    running: true,
    K: 64,
    baseLR: 0.08,
    adamFwd: freshAdam(),
    adamRev: freshAdam(),

    // Loss-landscape grid + color range (set by computeLandscapes).
    landCurRes: LAND_RES,
    landMuMin: 0, landMuMax: 1, landLsMin: 0, landLsMax: 1,
    landFwdGrid: null, landRevGrid: null,
    landVmin: 0, landVmax: 1,

    // Interaction.
    hoveredHandle: null,
    dragState: null,
    landDragActive: false,

    // Last MC step result (particles) for the rug plot.
    lastFwd: null,
    lastRev: null,
};

export function resetAdam() {
    S.adamFwd = freshAdam();
    S.adamRev = freshAdam();
}
