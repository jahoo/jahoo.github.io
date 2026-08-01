// ================================================================
//  Anchored forward KL — main.js
//  State, slider/drag/toggle wiring, redraw. One main canvas with
//  four horizontal-bar columns (potential, prior, posterior, optimum),
//  plus the segment diagram and the margin alpha(beta) plot.
// ================================================================

import {
    DEFAULT_K, defaultPrior, defaultValid, DEFAULT_BETA,
    BETA_MIN, BETA_MAX, VALID_COLOR, INVALID_COLOR,
} from './config.js';
import {
    normalize, withProb, solveAlpha, betaOfAlpha, anchoredOptimum,
    bernKL, bernKLPrime, fOfAlpha, fPrimeOfAlpha,
} from './model.js';
import {
    resetCanvas, getPos, layoutMain,
    drawHBarCol, drawPotentialCol, drawAlphaCurve, drawSegment, drawFPlot,
} from './drawing.js';
import {
    SLIDER_MAX, sliderToBeta, betaToSlider, buildTickLabels,
    accentColor, fmtBeta, fmtProb, dotHit,
} from './controls.js';

// ================================================================
//  STATE
// ================================================================

let k = DEFAULT_K;                      // support size
let probs = normalize(defaultPrior(k)); // the prior p
let valid = defaultValid(k);            // boolean mask: the potential r
let beta = DEFAULT_BETA;

let L = null;                 // main-canvas layout, set on every redraw
let hitM = null, hitS = null, hitF = null; // dot hit-test info from the beta plots
let cvMain, cvM, cvS, cvF, slider, sliderF, kSlider; // DOM, bound in init()
let roBeta, roAlpha, roZ, roK, roBetaF;


// ================================================================
//  REDRAW
// ================================================================

// The main canvas grows with the number of rows so bars stay grabbable.
function mainHeight() {
    const rowH = k <= 10 ? 28 : k <= 20 ? 22 : 14;
    return 34 + k * rowH + 26;
}

// Shared x-scale across the three probability columns, so bar lengths
// are comparable. Frozen during a bar drag.
let dragXmax = null;

function niceXmax(m) {
    return Math.min(1, Math.max(0.1, Math.ceil(m * 1.08 * 20) / 20));
}

function computePosterior() {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    return Z > 0
        ? normalize(probs.map((p, i) => (valid[i] ? p : 0)))
        : probs.slice();
}

function redraw() {
    if (!cvMain) return;
    const { q, alpha, Z } = anchoredOptimum(probs, valid, beta);
    const posterior = computePosterior();
    const xmax = dragXmax ?? niceXmax(Math.max(...probs, ...posterior, ...q));
    const colors = valid.map(v => (v ? VALID_COLOR : INVALID_COLOR));

    {
        const { ctx, w, h } = resetCanvas(cvMain);
        L = layoutMain(w, h, k);
        drawPotentialCol(ctx, L, L.pot, valid, {
            valid: VALID_COLOR, invalid: INVALID_COLOR,
        });
        drawHBarCol(ctx, L, L.prior, probs, {
            colors, xmax, title: 'prior', handles: true,
        });
        drawHBarCol(ctx, L, L.post, posterior, {
            colors, xmax, title: 'post',
        });
        drawHBarCol(ctx, L, L.opt, q, {
            colors, xmax, title: 'opt',
        });
    }

    if (cvS) {
        const { ctx, w, h } = resetCanvas(cvS);
        hitS = drawSegment(ctx, w, h, {
            Z, alpha, dotColor: accentColor(beta),
            validColor: VALID_COLOR, invalidColor: INVALID_COLOR,
        });
    }

    redrawMargin(alpha, Z);

    redrawF(alpha, Z);

    if (roBeta) roBeta.textContent = fmtBeta(beta);
    if (roBetaF) roBetaF.textContent = fmtBeta(beta);
    if (roAlpha) roAlpha.textContent = Z >= 1 ? '1' : fmtProb(alpha);
    if (roZ) roZ.textContent = fmtProb(Z);
    [slider, sliderF].forEach(s => {
        if (!s) return;
        // beta can also be set by dragging a dot or the other slider;
        // keep every thumb in sync
        s.value = String(betaToSlider(beta));
        s.style.setProperty('--akl-accent', accentColor(beta));
    });
}

// The margin plot: alpha_beta over the whole beta axis for the current Z,
// with a dot at the selected beta and the small-beta approximation dotted.
function redrawMargin(alpha, Z) {
    if (!cvM) return;
    hitM = null;
    const { ctx, w, h } = resetCanvas(cvM);
    if (w < 30) return; // collapsed margin note (narrow viewports)

    const N = 120;
    const curve = Array.from({ length: N + 1 }, (_, i) => {
        const f = i / N;
        return { f, a: solveAlpha(Z, sliderToBeta(f * SLIDER_MAX)) };
    });
    const approx = Z > 0 && Z < 1
        ? curve.map(({ f }) => {
            const b = sliderToBeta(f * SLIDER_MAX);
            const a = b === 0 ? 1 : 1 - ((1 - Z) / Z) * Math.exp(-1 / b);
            return { f, a };
        })
        : null;

    hitM = drawAlphaCurve(ctx, w, h, {
        curve, approx, Z,
        dot: { f: betaToSlider(beta) / SLIDER_MAX, a: alpha },
        dotColor: accentColor(beta),
    });
}

// The f plot in the derivation fold: the reduced objective f and its
// derivative over alpha, for the current Z and beta. At beta = infinity
// the drawn shape is the normalized limit f/beta = d(alpha || Z).
function fShapes(Z, b) {
    if (b === Infinity) {
        return {
            f: a => bernKL(a, Z),
            fp: a => bernKLPrime(a, Z),
            fLabel: 'f∕β', fpLabel: 'f′∕β',
        };
    }
    return {
        f: a => fOfAlpha(Z, b, a),
        fp: a => fPrimeOfAlpha(Z, b, a),
        fLabel: 'f', fpLabel: 'f′',
    };
}

function redrawF(alpha, Z) {
    if (!cvF) return;
    hitF = null;
    const { ctx, w, h } = resetCanvas(cvF);
    if (w < 40) return; // zero-size inside the closed <details>
    if (Z <= 0 || Z >= 1) return; // degenerate mask: nothing to plot
    const { f, fp, fLabel, fpLabel } = fShapes(Z, beta);
    const N = 240, lo = 0.002, hi = 0.998;
    const fCurve = [], fpCurve = [];
    for (let i = 0; i <= N; i++) {
        const a = lo + (i / N) * (hi - lo);
        fCurve.push({ a, y: f(a) });
        fpCurve.push({ a, y: fp(a) });
    }
    // clamp the marker strictly inside (0, 1): at beta = 0 the minimizer
    // sits on the boundary alpha = 1, where f' is not evaluable
    const aDot = Math.max(lo, Math.min(hi, alpha));
    hitF = drawFPlot(ctx, w, h, {
        fCurve, fpCurve, Z, alpha: aDot,
        fAtAlpha: f(aDot), fpAtAlpha: fp(aDot),
        fLabel, fpLabel, dotColor: accentColor(beta),
    });
}

// ================================================================
//  MAIN-CANVAS INTERACTION
//  Potential column: click/drag-paint to toggle validity.
//  Prior column: drag bar tips horizontally (auto-renormalizing).
// ================================================================

let dragKind = null; // 'bar' | 'paint' | 'dotM' | 'dotS' | 'dotF' | null
let dragIdx = -1;
let paintVal = null;

function inCol(pos, P, pad = 10) {
    return pos.x >= P.x - pad && pos.x <= P.x + P.w + pad;
}

const countValid = () => valid.reduce((s, v) => s + (v ? 1 : 0), 0);

// Flip row i to `to` unless that would remove the last valid element
// (the posterior is undefined when nothing is valid).
function setValid(i, to) {
    if (!to && valid[i] && countValid() === 1) return;
    valid[i] = to;
}

function barDragTo(pos) {
    const P = L.prior;
    const target = ((pos.x - P.x) / P.w) * dragXmax;
    probs = withProb(probs, dragIdx, target);
    redraw();
}

function onDown(e) {
    if (!L) return;
    const pos = getPos(cvMain, e);
    const i = L.rowAt(pos.y);
    if (i === -1) return;
    if (inCol(pos, L.pot)) {
        dragKind = 'paint';
        paintVal = !valid[i];
        setValid(i, paintVal);
        e.preventDefault();
        redraw();
    } else if (inCol(pos, L.prior)) {
        dragKind = 'bar';
        dragIdx = i;
        dragXmax = niceXmax(Math.max(...probs, ...computePosterior(),
            ...anchoredOptimum(probs, valid, beta).q));
        e.preventDefault();
        barDragTo(pos);
    }
}

// ---- The beta dots: the same parameter, grabbable in every plot ----

function betaFromMargin(x) {
    return sliderToBeta(Math.round(hitM.fOfX(x) * SLIDER_MAX));
}

function betaFromSegment(x) {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    let b = betaOfAlpha(Z, hitS.alphaOfX(x));
    // snap outside the slider's range, consistent with its endpoints
    if (b < BETA_MIN) b = 0;
    if (b > BETA_MAX) b = Infinity;
    return b;
}

function betaFromF(x) {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    let b = betaOfAlpha(Z, hitF.alphaOfX(x));
    // snap outside the slider's range, consistent with its endpoints
    if (b < BETA_MIN) b = 0;
    if (b > BETA_MAX) b = Infinity;
    return b;
}

// Attach dot-dragging to one of the beta plots. betaAt maps a canvas x
// to the new beta; hitGetter returns the plot's current hit info.
function bindBetaDot(cv, kind, hitGetter, betaAt) {
    if (!cv) return;
    const onDotDown = e => {
        const pos = getPos(cv, e);
        if (!dotHit(hitGetter(), pos)) return;
        dragKind = kind;
        e.preventDefault();
        beta = betaAt(pos.x);
        redraw();
    };
    cv.addEventListener('mousedown', onDotDown);
    cv.addEventListener('touchstart', onDotDown, { passive: false });
    cv.addEventListener('mousemove', e => {
        if (dragKind) return;
        cv.style.cursor = dotHit(hitGetter(), getPos(cv, e)) ? 'grab' : '';
    });
}

function onMove(e) {
    if (dragKind === 'dotM') {
        e.preventDefault();
        beta = betaFromMargin(getPos(cvM, e).x);
        redraw();
    } else if (dragKind === 'dotS') {
        e.preventDefault();
        beta = betaFromSegment(getPos(cvS, e).x);
        redraw();
    } else if (dragKind === 'dotF') {
        e.preventDefault();
        beta = betaFromF(getPos(cvF, e).x);
        redraw();
    } else if (dragKind === 'bar') {
        e.preventDefault();
        barDragTo(getPos(cvMain, e));
    } else if (dragKind === 'paint') {
        e.preventDefault();
        const pos = getPos(cvMain, e);
        const i = L.rowAt(pos.y);
        if (i !== -1 && valid[i] !== paintVal) {
            setValid(i, paintVal);
            redraw();
        }
    } else if (!e.touches && L && cvMain) {
        // hover affordance
        const pos = getPos(cvMain, e);
        const i = L.rowAt(pos.y);
        cvMain.style.cursor =
            i === -1 ? '' :
            inCol(pos, L.pot) ? 'pointer' :
            inCol(pos, L.prior) ? 'ew-resize' : '';
    }
}

function onUp() {
    if (dragKind === 'bar') {
        dragKind = null;
        dragXmax = null;
        redraw(); // unfreeze the x-scale
    }
    dragKind = null;
    dragIdx = -1;
}

// ================================================================
//  INIT
// ================================================================

export function init() {
    cvMain = document.getElementById('cv-akl-main');
    cvM = document.getElementById('cv-akl-alpha');
    cvS = document.getElementById('cv-akl-segment');
    cvF = document.getElementById('cv-akl-f');
    slider = document.getElementById('akl-beta');
    sliderF = document.getElementById('akl-beta-f');
    kSlider = document.getElementById('akl-k');
    roBeta = document.getElementById('akl-readout-beta');
    roAlpha = document.getElementById('akl-readout-alpha');
    roZ = document.getElementById('akl-readout-z');
    roK = document.getElementById('akl-readout-k');
    roBetaF = document.getElementById('akl-readout-beta-f');
    if (!cvMain) return;

    cvMain.style.height = mainHeight() + 'px';

    if (slider) {
        slider.max = String(SLIDER_MAX);
        slider.value = String(betaToSlider(beta));
        slider.addEventListener('input', () => {
            beta = sliderToBeta(Number(slider.value));
            redraw();
        });
    }

    if (sliderF) {
        sliderF.max = String(SLIDER_MAX);
        sliderF.value = String(betaToSlider(beta));
        sliderF.addEventListener('input', () => {
            beta = sliderToBeta(Number(sliderF.value));
            redraw();
        });
    }

    if (kSlider) {
        kSlider.value = String(k);
        if (roK) roK.textContent = String(k);
        kSlider.addEventListener('input', () => {
            const next = Number(kSlider.value);
            if (next === k) return;
            k = next;
            probs = normalize(defaultPrior(k)); // changing K resets the setup
            valid = defaultValid(k);
            if (roK) roK.textContent = String(k);
            cvMain.style.height = mainHeight() + 'px';
            redraw();
        });
    }

    // The margin plot's canvas is display:none behind the theme's margin
    // toggle on narrow viewports; repaint when it (re)appears.
    document.querySelectorAll('.margin-toggle').forEach(t =>
        t.addEventListener('change', () => setTimeout(redraw, 0)));

    // The f plot's canvas has zero size while its <details> is closed;
    // repaint when the fold opens (same trick as the margin toggle).
    const fold = cvF && cvF.closest('details');
    if (fold) fold.addEventListener('toggle', () => redraw());

    cvMain.addEventListener('mousedown', onDown);
    cvMain.addEventListener('touchstart', onDown, { passive: false });
    bindBetaDot(cvM, 'dotM', () => hitM, betaFromMargin);
    bindBetaDot(cvS, 'dotS', () => hitS, betaFromSegment);
    bindBetaDot(cvF, 'dotF', () => hitF, betaFromF);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', redraw);

    redraw();
}
