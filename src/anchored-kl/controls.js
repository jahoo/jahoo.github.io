// ================================================================
//  Anchored forward KL — controls.js
//  Slider/readout helpers shared by the binary (main.js) and
//  continuous (main-continuous.js) instances. Pure functions and
//  DOM-generic utilities only: no per-instance state lives here.
// ================================================================

import { BETA_MIN, BETA_MAX } from './config.js';

// ---- Beta slider mapping ----
// Log scale over [BETA_MIN, BETA_MAX] with the exact endpoints
// snapping to beta = 0 (posterior) and beta = infinity (prior).

export const SLIDER_MAX = 1000;

export function sliderToBeta(v) {
    if (v <= 0) return 0;
    if (v >= SLIDER_MAX) return Infinity;
    return BETA_MIN * Math.pow(BETA_MAX / BETA_MIN, v / SLIDER_MAX);
}

export function betaToSlider(b) {
    if (b === 0) return 0;
    if (b === Infinity) return SLIDER_MAX;
    const f = Math.log(b / BETA_MIN) / Math.log(BETA_MAX / BETA_MIN);
    return Math.round(Math.max(0, Math.min(1, f)) * SLIDER_MAX);
}

const THUMB_W = 14; // keep in sync with the slider thumb width in the CSS
const thumbX = f => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;

export function buildTickLabels() {
    // 1 is the log-midpoint of [BETA_MIN, BETA_MAX]
    const ticks = [['0', 0], ['1', 0.5], ['∞', 1]];
    document.querySelectorAll('.akl-slider-ticks').forEach(wrap => {
        wrap.replaceChildren(...ticks.map(([text, f]) => {
            const s = document.createElement('span');
            s.textContent = text;
            s.style.left = thumbX(f);
            return s;
        }));
    });
}

// Thumb accent for a given beta: valid blue at beta = 0 (posterior)
// fading to neutral gray at beta = infinity (prior). The rgb triples
// mirror VALID_COLOR and NEUTRAL_COLOR in config.js.
export function accentColor(beta) {
    const f = betaToSlider(beta) / SLIDER_MAX;
    const a = [41, 128, 185], b = [150, 156, 164];
    const rgb = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * f));
    return `rgb(${rgb.join(',')})`;
}

// ---- Readout formatting ----

const typeset = s => s.replace('-', '−');

export function fmtBeta(b) {
    if (b === 0) return '0';
    if (b === Infinity) return '∞';
    return typeset(Number(b.toPrecision(3)).toString());
}

export const fmtProb = v => {
    if (v === 0) return '0';
    if (v === 1) return '1';
    if (v < 1e-3) return typeset(v.toExponential(2));
    return typeset(Number(v.toPrecision(3)).toString());
};

// ---- Shared hit-testing ----

export function dotHit(hit, pos) {
    if (!hit) return false;
    const dots = hit.dots || (hit.dot ? [hit.dot] : []);
    return dots.some(d =>
        Math.abs(pos.x - d.x) < 12 && Math.abs(pos.y - d.y) < 14);
}

// ---- K dropdown chips ----
// Close a chip's floating panel on any click outside it. Call once.

export function bindDropdownClose() {
    document.querySelectorAll('.akl-k-dropdown').forEach(drop =>
        document.addEventListener('pointerdown', e => {
            if (drop.open && !drop.contains(e.target)) drop.open = false;
        }));
}
