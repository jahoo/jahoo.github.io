// ================================================================
//  Temperature scaling — main.js
//  State, slider/preset/drag wiring, redraw.
// ================================================================

import { K, MIN_P, BASE_COLOR, PRESETS } from './config.js';
import { temper, normalize, isNegativeTemp } from './model.js';
import { sliderToT, tToSlider, SLIDER_MAX } from './sliderscale.js';
import {
    resetCanvas,
    getPos,
    layout,
    tempColor,
    drawProbPanel,
    drawLogPanel,
} from './drawing.js';

// ================================================================
//  STATE
// ================================================================

let probs = normalize(PRESETS.unimodal); // the base distribution p
let T = 1;
let negative = false; // hidden toggle: symlog axis extending past ∞ to T < 0
let L = null;         // current canvas layout, set on every redraw

let cv, slider, readout, readoutBeta, preset, negToggle, ticksWrap,
    dirsWrap; // DOM, bound in init()

// ================================================================
//  READOUTS + SLIDER LABELS
//  The slider axis is beta = 1/T, increasing left -> right:
//  beta = 0 (uniform) at the left edge, beta = ∞ (argmax) at the
//  right edge — with the negative half unfolding to the left of 0
//  down to beta = −∞ (argmin) when the toggle is on.
// ================================================================

const typeset = s => s.replace('-', '−');

function fmtT(t) {
    if (Object.is(t, -0)) return '−0  (argmin)';
    if (t === 0) return '0  (argmax)';
    if (t === Infinity) return negative ? '±∞  (uniform)' : '∞  (uniform)';
    return typeset(Number(t.toPrecision(3)).toString());
}

function fmtBeta(t) {
    if (Object.is(t, -0)) return '−∞';
    if (t === 0) return '∞';
    if (t === Infinity) return '0';
    return typeset(Number((1 / t).toPrecision(3)).toString());
}

const THUMB_W = 14; // keep in sync with the slider thumb width in the CSS

// Horizontal position of the thumb's center at fraction f of the range
// (the center travels [THUMB_W/2, width - THUMB_W/2], not the full track).
const thumbX = f => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;

function updateTickLabels() {
    if (!ticksWrap) return;
    const labels = negative ? ['−∞', '−1', '0', '1', '∞'] : ['0', '1', '∞'];
    ticksWrap.replaceChildren(...labels.map((text, i) => {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.left = thumbX(i / (labels.length - 1));
        return s;
    }));
}

// Temperature landmarks above the slider, tinted with the axis color at
// the position each marks. Positive-only mode: direction arrows at the
// edges (T decreases monotonically rightward) plus T = 1 at the center.
// Symlog mode: T is not monotone along the axis, so mark the landmarks
// instead — the one-sided T -> 0 limits at the edges, T = ±1 at the
// quarter points, and the T = ±∞ snap at the center.
function updateDirLabels() {
    if (!dirsWrap) return;
    const items = negative
        ? [
            { html: '<i>T</i> ↑ 0', f: 0, color: tempColor(-0), edge: 'left' },
            { html: '<i>T</i> = −1', f: 0.25, color: tempColor(-1) },
            { html: '<i>T</i> = ±∞', f: 0.5, color: tempColor(Infinity) },
            { html: '<i>T</i> = 1', f: 0.75, color: tempColor(1) },
            { html: '<i>T</i> ↓ 0', f: 1, color: tempColor(0), edge: 'right' },
        ]
        : [
            { html: '← higher temperature', f: 0, color: tempColor(Infinity), edge: 'left' },
            { html: '<i>T</i> = 1', f: 0.5, color: tempColor(1) },
            { html: 'lower temperature →', f: 1, color: tempColor(0), edge: 'right' },
        ];
    dirsWrap.replaceChildren(...items.map(({ html, f, color, edge }) => {
        const s = document.createElement('span');
        s.innerHTML = html;
        s.style.color = color;
        if (edge === 'left') {
            s.style.left = '0';
        } else if (edge === 'right') {
            s.style.right = '0';
        } else {
            s.style.left = thumbX(f);
            s.style.transform = 'translateX(-50%)';
        }
        return s;
    }));
}

// ================================================================
//  REDRAW
// ================================================================

function redraw() {
    if (!cv) return;
    const { ctx, w, h } = resetCanvas(cv);
    L = layout(w, h);

    const tempered = temper(probs, T);
    const color = tempColor(T);

    // pre-normalization log values beta·log p — shown whenever beta >= 0
    // (negative beta puts them above the 0-line, off the panel). At the
    // snaps: beta = 0 collapses all ticks onto the 0-line; beta = ∞ sends
    // them all below the display floor (carets), since every p_i < 1.
    const ghost = isNegativeTemp(T) ? null : probs.map(p => {
        if (p <= 0) return -Infinity;
        if (T === Infinity) return 0;   // beta = 0
        if (T === 0) return -Infinity;  // beta = ∞
        return Math.log(p) / T;
    });

    drawProbPanel(ctx, L, L.panel(0, 0), probs, {
        color: BASE_COLOR,
        label: { sym: 'p' },
        handles: true,
    });
    drawProbPanel(ctx, L, L.panel(1, 0), tempered, {
        color,
        label: { sym: 'p', sup: '(T)' },
    });
    drawLogPanel(ctx, L, L.panel(0, 1), probs.map(Math.log), {
        color: BASE_COLOR,
        label: { pre: 'log ', sym: 'p' },
    });
    drawLogPanel(ctx, L, L.panel(1, 1), tempered.map(Math.log), {
        color,
        label: { pre: 'log ', sym: 'p', sup: '(T)' },
        ghost,
    });

    if (readout) readout.textContent = fmtT(T);
    if (readoutBeta) readoutBeta.textContent = fmtBeta(T);
    if (slider) slider.style.setProperty('--temp-accent', color);
}

// ================================================================
//  BASE-DISTRIBUTION DRAG (top-left panel)
// ================================================================

// Set p_i to target, rescaling the others to keep the sum at 1.
// probs always sums to 1, so the others currently hold 1 - probs[i].
function setProb(i, target) {
    target = Math.max(MIN_P, Math.min(1 - (K - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - probs[i]);
    probs = normalize(probs.map((p, j) =>
        j === i ? target : Math.max(MIN_P, p * scale)));
}

let dragIdx = -1; // bar being dragged (-1 = none)

// Which base-panel bar slot is at canvas position pos? (-1 = none)
function hitBaseSlot(pos) {
    if (!L) return -1;
    const P = L.panel(0, 0);
    if (pos.x < P.x || pos.x > P.x + P.w) return -1;
    if (pos.y < P.y - 6 || pos.y > P.y + P.h + 6) return -1;
    const i = Math.floor((pos.x - P.x - L.inset) / L.slotW);
    return i >= 0 && i < K ? i : -1;
}

function dragTo(pos) {
    const P = L.panel(0, 0);
    setProb(dragIdx, (P.y + P.h - pos.y) / P.h); // invert probY
    if (preset) preset.value = 'custom';
    redraw();
}

function onDown(e) {
    const idx = hitBaseSlot(getPos(cv, e));
    if (idx === -1) return;
    dragIdx = idx;
    e.preventDefault();
    dragTo(getPos(cv, e));
}

function onMove(e) {
    if (dragIdx !== -1) {
        e.preventDefault();
        dragTo(getPos(cv, e));
    } else if (!e.touches) {
        // hover affordance
        cv.style.cursor = hitBaseSlot(getPos(cv, e)) === -1 ? '' : 'ns-resize';
    }
}

function onUp() {
    dragIdx = -1;
}

// ================================================================
//  INIT
// ================================================================

export function init() {
    cv = document.getElementById('cv-temp');
    slider = document.getElementById('temp-slider');
    readout = document.getElementById('temp-readout');
    readoutBeta = document.getElementById('temp-readout-beta');
    preset = document.getElementById('temp-preset');
    negToggle = document.getElementById('temp-negative');
    ticksWrap = document.querySelector('.temp-slider-ticks');
    dirsWrap = document.querySelector('.temp-slider-dirs');
    if (!cv) return;

    if (slider) {
        slider.max = String(SLIDER_MAX);
        slider.addEventListener('input', () => {
            T = sliderToT(Number(slider.value), negative);
            redraw();
        });
    }

    if (negToggle) {
        negToggle.addEventListener('change', () => {
            negative = negToggle.checked;
            // keep T where it was; negative T folds back to |T| when the
            // axis loses its negative half
            if (!negative) T = Math.abs(T);
            if (slider) slider.value = String(tToSlider(T, negative));
            updateTickLabels();
            updateDirLabels();
            redraw();
        });
    }

    if (preset) {
        preset.addEventListener('change', () => {
            if (PRESETS[preset.value]) {
                probs = normalize(PRESETS[preset.value]);
                redraw();
            }
        });
    }

    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', redraw);

    updateTickLabels();
    updateDirLabels();
    redraw();
}
