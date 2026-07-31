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
} from './model.js';
import {
    resetCanvas, getPos, layoutMain,
    drawHBarCol, drawPotentialCol, drawAlphaCurve, drawSegment,
} from './drawing.js';

// ================================================================
//  STATE
// ================================================================

let k = DEFAULT_K;                      // support size
let probs = normalize(defaultPrior(k)); // the prior p
let valid = defaultValid(k);            // boolean mask: the potential r
let beta = DEFAULT_BETA;

let L = null;                 // main-canvas layout, set on every redraw
let hitM = null, hitS = null; // dot hit-test info from the beta plots
let cvMain, cvM, cvS, slider, kSlider; // DOM, bound in init()
let roBeta, roAlpha, roZ, roK, ticksWrap;

// ================================================================
//  BETA SLIDER
//  Log scale over [BETA_MIN, BETA_MAX] with the exact endpoints
//  snapping to beta = 0 (posterior) and beta = infinity (prior).
// ================================================================

const SLIDER_MAX = 1000;

function sliderToBeta(v) {
    if (v <= 0) return 0;
    if (v >= SLIDER_MAX) return Infinity;
    return BETA_MIN * Math.pow(BETA_MAX / BETA_MIN, v / SLIDER_MAX);
}

function betaToSlider(b) {
    if (b === 0) return 0;
    if (b === Infinity) return SLIDER_MAX;
    const f = Math.log(b / BETA_MIN) / Math.log(BETA_MAX / BETA_MIN);
    return Math.round(Math.max(0, Math.min(1, f)) * SLIDER_MAX);
}

const THUMB_W = 14; // keep in sync with the slider thumb width in the CSS
const thumbX = f => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;

function buildTickLabels() {
    if (!ticksWrap) return;
    // 1 is the log-midpoint of [BETA_MIN, BETA_MAX]
    const ticks = [['0', 0], ['1', 0.5], ['∞', 1]];
    ticksWrap.replaceChildren(...ticks.map(([text, f]) => {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.left = thumbX(f);
        return s;
    }));
}

// Thumb accent: valid blue at beta = 0 (posterior) fading to neutral
// gray at beta = infinity (prior).
function accentColor() {
    const f = betaToSlider(beta) / SLIDER_MAX;
    const a = [41, 128, 185], b = [150, 156, 164];
    const rgb = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * f));
    return `rgb(${rgb.join(',')})`;
}

// ================================================================
//  READOUTS
// ================================================================

const typeset = s => s.replace('-', '−');

function fmtBeta(b) {
    if (b === 0) return '0';
    if (b === Infinity) return '∞';
    return typeset(Number(b.toPrecision(3)).toString());
}

const fmtProb = v => {
    if (v === 0) return '0';
    if (v === 1) return '1';
    if (v < 1e-3) return typeset(v.toExponential(2));
    return typeset(Number(v.toPrecision(3)).toString());
};

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
            Z, alpha, dotColor: accentColor(),
            validColor: VALID_COLOR, invalidColor: INVALID_COLOR,
        });
    }

    redrawMargin(alpha, Z);

    if (roBeta) roBeta.textContent = fmtBeta(beta);
    if (roAlpha) roAlpha.textContent = Z >= 1 ? '1' : fmtProb(alpha);
    if (roZ) roZ.textContent = fmtProb(Z);
    if (slider) {
        // beta can also be set by dragging a dot; keep the thumb in sync
        slider.value = String(betaToSlider(beta));
        slider.style.setProperty('--akl-accent', accentColor());
    }
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
        dotColor: accentColor(),
    });
}

// ================================================================
//  MAIN-CANVAS INTERACTION
//  Potential column: click/drag-paint to toggle validity.
//  Prior column: drag bar tips horizontally (auto-renormalizing).
// ================================================================

let dragKind = null; // 'bar' | 'paint' | 'dotM' | 'dotS' | null
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

function dotHit(hit, pos) {
    return !!(hit && hit.dot
        && Math.abs(pos.x - hit.dot.x) < 12
        && Math.abs(pos.y - hit.dot.y) < 14);
}

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
    slider = document.getElementById('akl-beta');
    kSlider = document.getElementById('akl-k');
    roBeta = document.getElementById('akl-readout-beta');
    roAlpha = document.getElementById('akl-readout-alpha');
    roZ = document.getElementById('akl-readout-z');
    roK = document.getElementById('akl-readout-k');
    ticksWrap = document.querySelector('.akl-slider-ticks');
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

    cvMain.addEventListener('mousedown', onDown);
    cvMain.addEventListener('touchstart', onDown, { passive: false });
    bindBetaDot(cvM, 'dotM', () => hitM, betaFromMargin);
    bindBetaDot(cvS, 'dotS', () => hitS, betaFromSegment);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', redraw);

    buildTickLabels();
    redraw();
}
