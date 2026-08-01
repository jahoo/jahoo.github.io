// ================================================================
//  Anchored forward KL — main-continuous.js
//  The continuous-potential instance: its own state (prior, potential,
//  beta, K), fully separate from the binary instance in main.js. One
//  main canvas with four columns — the potential column is continuous
//  and draggable — plus the softened-potential reshaping curve.
// ================================================================

import {
    DEFAULT_K, DEFAULT_BETA, defaultPrior, defaultPhi,
} from './config.js';
import { normalize, withProb, contOptimum } from './model.js';
import {
    resetCanvas, getPos, layoutMain, drawHBarCol, drawReshapeCurve,
} from './drawing.js';
import {
    SLIDER_MAX, sliderToBeta, betaToSlider, accentColor, fmtBeta, fmtProb,
} from './controls.js';

// ================================================================
//  STATE (nothing here is shared with the binary instance)
// ================================================================

let k = DEFAULT_K;
let probs = normalize(defaultPrior(k));
let phi = defaultPhi(k);
let beta = DEFAULT_BETA;

let L = null;
let hitR = null; // reshape-curve hit info: dots draggable along the curve
let cvMain, cvR, slider, kSlider;
let roBeta, roEps, roZ, roK;

// ================================================================
//  REDRAW
// ================================================================

function mainHeight() {
    const rowH = k <= 10 ? 28 : k <= 20 ? 22 : 14;
    return 34 + k * rowH + 26;
}

let dragXmax = null;

function niceXmax(m) {
    return Math.min(1, Math.max(0.1, Math.ceil(m * 1.08 * 20) / 20));
}

// Row color: invalid red at phi = 0 blending to valid blue at phi = 1
// (the binary section's two colors are this scale's endpoints).
function phiColor(v) {
    const red = [192, 57, 43], blue = [41, 128, 185];
    const rgb = [0, 1, 2].map(i => Math.round(red[i] + (blue[i] - red[i]) * v));
    return `rgb(${rgb.join(',')})`;
}

function computePosterior() {
    const Z = probs.reduce((s, p, i) => s + p * phi[i], 0);
    return Z > 0 ? normalize(probs.map((p, i) => p * phi[i])) : probs.slice();
}

function redraw() {
    if (!cvMain) return;
    const { q, softened, eps, Z } = contOptimum(probs, phi, beta);
    const posterior = computePosterior();
    const xmax = dragXmax ?? niceXmax(Math.max(...probs, ...posterior, ...q));
    const colors = phi.map(phiColor);

    {
        const { ctx, w, h } = resetCanvas(cvMain);
        L = layoutMain(w, h, k, { potW: 90 });
        drawHBarCol(ctx, L, L.pot, phi, {
            colors, xmax: 1, title: 'pot', handles: true, uniformRef: false,
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

    if (cvR) {
        hitR = null;
        const { ctx, w, h } = resetCanvas(cvR);
        const N = 160;
        const curve = Array.from({ length: N + 1 }, (_, i) => {
            const x = i / N;
            return { x, y: softened(x) };
        });
        const dots = phi.map((v, i) => ({ x: v, y: softened(v), color: colors[i] }));
        hitR = drawReshapeCurve(ctx, w, h, { curve, eps, dots });
    }

    if (roBeta) roBeta.textContent = fmtBeta(beta);
    if (roEps) roEps.textContent = fmtProb(eps);
    if (roZ) roZ.textContent = fmtProb(Z);
    if (slider) {
        slider.value = String(betaToSlider(beta));
        slider.style.setProperty('--akl-accent', accentColor(beta));
    }
}

// ================================================================
//  INTERACTION
//  Potential column: drag bar tips to any value in [0, 1].
//  Prior column: drag bar tips horizontally (auto-renormalizing).
//  Reshape curve: drag a dot along the curve to set that element's
//  potential (the same edit as its bar, in the curve's coordinates).
// ================================================================

let dragKind = null; // 'phi' | 'bar' | 'dotR' | null
let dragIdx = -1;

// The reshape-curve dot under the pointer, or -1 (nearest wins when
// dots overlap, which happens for elements with similar potentials).
function dotRAt(pos) {
    if (!hitR) return -1;
    let best = -1, bestD = Infinity;
    hitR.dots.forEach(d => {
        const dx = pos.x - d.x, dy = pos.y - d.y;
        if (Math.abs(dx) < 12 && Math.abs(dy) < 14 && dx * dx + dy * dy < bestD) {
            bestD = dx * dx + dy * dy;
            best = d.i;
        }
    });
    return best;
}

function dotRDragTo(pos) {
    phi[dragIdx] = hitR.phiOfX(pos.x);
    redraw();
}

function inCol(pos, P, pad = 10) {
    return pos.x >= P.x - pad && pos.x <= P.x + P.w + pad;
}

function phiDragTo(pos) {
    const P = L.pot;
    phi[dragIdx] = Math.max(0, Math.min(1, (pos.x - P.x) / P.w));
    redraw();
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
        dragKind = 'phi';
        dragIdx = i;
        dragXmax = niceXmax(Math.max(...probs, ...computePosterior(),
            ...contOptimum(probs, phi, beta).q));
        e.preventDefault();
        phiDragTo(pos);
    } else if (inCol(pos, L.prior)) {
        dragKind = 'bar';
        dragIdx = i;
        dragXmax = niceXmax(Math.max(...probs, ...computePosterior(),
            ...contOptimum(probs, phi, beta).q));
        e.preventDefault();
        barDragTo(pos);
    }
}

function onDownR(e) {
    const pos = getPos(cvR, e);
    const i = dotRAt(pos);
    if (i === -1) return;
    dragKind = 'dotR';
    dragIdx = i;
    dragXmax = niceXmax(Math.max(...probs, ...computePosterior(),
        ...contOptimum(probs, phi, beta).q));
    e.preventDefault();
    dotRDragTo(pos);
}

function onMove(e) {
    if (dragKind === 'phi') {
        e.preventDefault();
        phiDragTo(getPos(cvMain, e));
    } else if (dragKind === 'bar') {
        e.preventDefault();
        barDragTo(getPos(cvMain, e));
    } else if (dragKind === 'dotR') {
        e.preventDefault();
        dotRDragTo(getPos(cvR, e));
    } else if (!e.touches && L && cvMain) {
        // hover affordance
        const pos = getPos(cvMain, e);
        const i = L.rowAt(pos.y);
        cvMain.style.cursor =
            i !== -1 && (inCol(pos, L.pot) || inCol(pos, L.prior))
                ? 'ew-resize' : '';
    }
}

function onUp() {
    if (dragKind !== null) {
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

export function initContinuous() {
    cvMain = document.getElementById('cv-akl-c-main');
    cvR = document.getElementById('cv-akl-c-reshape');
    slider = document.getElementById('akl-c-beta');
    kSlider = document.getElementById('akl-c-k');
    roBeta = document.getElementById('akl-c-readout-beta');
    roEps = document.getElementById('akl-c-readout-eps');
    roZ = document.getElementById('akl-c-readout-z');
    roK = document.getElementById('akl-c-readout-k');
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
            phi = defaultPhi(k);
            if (roK) roK.textContent = String(k);
            cvMain.style.height = mainHeight() + 'px';
            redraw();
        });
    }

    cvMain.addEventListener('mousedown', onDown);
    cvMain.addEventListener('touchstart', onDown, { passive: false });
    if (cvR) {
        cvR.addEventListener('mousedown', onDownR);
        cvR.addEventListener('touchstart', onDownR, { passive: false });
        cvR.addEventListener('mousemove', e => {
            if (dragKind) return;
            cvR.style.cursor = dotRAt(getPos(cvR, e)) !== -1 ? 'ew-resize' : '';
        });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', redraw);

    redraw();
}
