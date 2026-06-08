// ================================================================
//  Interactive divergence fitting — main.js
//  DOM wiring (controls, sliders, toggles, keyboard), the requestAnimationFrame
//  loop that drives optimization + redraw, and init() which fetches the DOM
//  and starts everything. State lives in state.js; math in algorithms.js;
//  rendering in drawing.js; pointer interaction in interaction.js.
// ================================================================

import { S, resetAdam } from './state.js';
import { LAND_RES_LO } from './config.js';
import { fmtNum } from './mathutils.js';
import { PARAMS, curP, qToLand } from './parameterizations.js';
import {
    computeOptimal, computeLandscapes, computeLandBounds,
    divForward, divReverse,
    stepForwardKL, stepREINFORCE, stepReverseKL,
    stepForwardKL_deterministic, stepReverseKL_deterministic,
    stepForwardChisq, stepReverseChisq,
    stepForwardChisq_deterministic, stepReverseChisq_deterministic,
} from './algorithms.js';
import { drawPanel, drawLandscape, heatmap, resizeCanvas } from './drawing.js';
import { setupCanvas, setupLandscape } from './interaction.js';

// ===== DOM refs (assigned in init) =====
let canvasFwd, canvasRev, canvasLandFwd, canvasLandRev;
let btnPlayPause, btnStep, sliderK, selectDiv, selectParam, qFormulaEl;
let btnDeterministic, btnMC, btnReinforce, btnReparam, sliderMix;

// ===== Loop / control local state =====
let doOneStep = false;
let stepsPerSec = 60;
let stepsAccum = 0, lastFrameTime = 0;
let fpsFrames = 0, fpsLast = 0, fpsVal = 0;  // fpsLast seeded in init()
let recomputeTimer = null;

// ===== Canvas sizing =====
function initCanvases() {
    resizeCanvas(canvasFwd); resizeCanvas(canvasRev);
    resizeCanvas(canvasLandFwd); resizeCanvas(canvasLandRev);
}

// ===== Play/pause =====
function updatePlayState() {
    btnPlayPause.innerHTML = S.running ? '⏸ <span class="key">␣</span>' : '▶ <span class="key">␣</span>';
    btnPlayPause.classList.toggle('active', !S.running);  // dark when paused
    btnStep.disabled = S.running;
}

// ===== K control (log-scale slider) =====
const LOG_K_MAX = Math.log(512);
function kToSlider(k) { return Math.round(Math.log(Math.max(1, k)) / LOG_K_MAX * 1000); }
function sliderToK(s) { return Math.max(1, Math.round(Math.exp(s / 1000 * LOG_K_MAX))); }
function setK(v) {
    S.K = Math.max(1, Math.min(512, v));
    sliderK.value = kToSlider(S.K);
    document.getElementById('val-K').textContent = S.K;
}

// ===== Speed slider: log-scale steps/sec =====
const LOG_SPEED_MIN = 1, LOG_SPEED_MAX = 12;  // 2^1=2 to 2^12=4096
function speedFromSlider(v) { return Math.pow(2, LOG_SPEED_MIN + (v / 1000) * (LOG_SPEED_MAX - LOG_SPEED_MIN)); }

// ===== "via" labels under each row =====
function updateViaLabels() {
    const fwdVia = document.getElementById('fwd-via');
    const revVia = document.getElementById('rev-via');
    if (S.divergenceType === 'kl') {
        fwdVia.textContent = S.gradientMode === 'mc' ? ', via importance sampling' : ', via closed-form moments of p';
        revVia.textContent = S.gradientMode === 'mc' ? ', via ' : ', via numerical integration';
    } else {
        fwdVia.textContent = S.gradientMode === 'mc' ? ', via IS (w² weights)' : ', via numerical integration';
        revVia.textContent = S.gradientMode === 'mc' ? ', via pathwise estimator' : ', via numerical integration';
    }
    fitRowLabels();
}

function setDivergence(type) {
    S.divergenceType = type;
    selectDiv.value = type;
    document.body.classList.toggle('div-kl', type === 'kl');
    document.body.classList.toggle('div-chisq', type === 'chisq');
    updateViaLabels();
    renderQFormula();  // tooltip is divergence-aware
    updateOptimizerNote();
    computeOptimal();
    computeLandscapes();
    resetAdam();
    S.lastFwd = null; S.lastRev = null;
}

function renderQFormula() {
    if (typeof katex !== 'undefined' && qFormulaEl) {
        katex.render(curP().formula, qFormulaEl, { throwOnError: false });
        qFormulaEl.title = curP().tooltip() || '';
    }
}

// ===== Optimizer explainer note =====
function updateOptimizerNote() {
    const el = document.getElementById('optimizer-note');
    let s = '<b>Optimizer</b>: With <b>natural gradient</b> on (default), gradients are premultiplied by <b>F⁻¹</b> (Fisher information inverse of <i>q<sub>φ</sub></i>) and fed to <b>SGD with momentum</b> (β = 0.9) — this makes the update parameterization-invariant. With natural gradient off, <b>Adam</b> is used instead (β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸). Learning rate decays as lr<sub>t</sub> = lr₀ / (1 + 0.001t). Optimization is over the selected φ.';
    if (S.divergenceType === 'chisq') {
        s += ' Note: F⁻¹ is the Fisher of <i>q</i>, not the Hessian of χ², so natural gradient is not Newton\'s method here (unlike forward KL in natural parameters). The forward χ² landscape is still convex in natural parameters (in fact log-convex), so convergence is guaranteed.';
    }
    el.innerHTML = s;
}

function setGradientMode(mode) {
    S.gradientMode = mode;
    btnDeterministic.classList.toggle('active', mode === 'deterministic');
    btnMC.classList.toggle('active', mode === 'mc');
    document.body.className = (mode === 'mc' ? 'mode-mc' : 'mode-det') + ' ' + (S.divergenceType === 'kl' ? 'div-kl' : 'div-chisq');
    updateViaLabels();
    document.getElementById('subtitle').textContent = mode === 'mc'
        ? 'Monte Carlo gradient estimation — drag the target modes or the fitted distribution'
        : 'Deterministic gradient computation — drag the target modes or the fitted distribution';
    resetAdam();
    S.lastFwd = null; S.lastRev = null;
}

// ===== Off-grid detection + debounced landscape recompute =====
function isOffGrid(q) {
    const [a1, a2] = qToLand(q);
    return a1 < S.landMuMin || a1 > S.landMuMax ||
        a2 < S.landLsMin || a2 > S.landLsMax;
}

function scheduleRecompute() {
    // Debounce: wait 250ms so that if q bounces back in range, we skip the expensive recompute
    if (recomputeTimer !== null) return;
    recomputeTimer = setTimeout(() => {
        recomputeTimer = null;
        // Check if q is still off-grid — if it came back, skip
        if (!isOffGrid(S.qFwd) && !isOffGrid(S.qRev)) return;
        // Only recompute if bounds would actually change
        const prev = [S.landMuMin, S.landMuMax, S.landLsMin, S.landLsMax];
        computeLandBounds();
        const delta = Math.abs(S.landMuMin - prev[0]) + Math.abs(S.landMuMax - prev[1]) +
            Math.abs(S.landLsMin - prev[2]) + Math.abs(S.landLsMax - prev[3]);
        const range = (prev[1] - prev[0]) + (prev[3] - prev[2]);
        if (delta / (range + 1e-8) > 0.08) {
            computeLandscapes();
        }
    }, 250);
}

// ===== One optimization step (dispatch by divergence + mode) =====
function doStep() {
    if (S.divergenceType === 'chisq') {
        if (S.gradientMode === 'deterministic') {
            stepForwardChisq_deterministic();
            stepReverseChisq_deterministic();
            S.lastFwd = null; S.lastRev = null;
        } else {
            S.lastFwd = stepForwardChisq();
            S.lastRev = stepReverseChisq();
        }
    } else {
        if (S.gradientMode === 'deterministic') {
            stepForwardKL_deterministic();
            stepReverseKL_deterministic();
            S.lastFwd = null; S.lastRev = null;
        } else {
            S.lastFwd = stepForwardKL();
            S.lastRev = (S.reverseMethod === 'reinforce') ? stepREINFORCE() : stepReverseKL();
        }
    }
    fpsFrames++;
    if (isOffGrid(S.qFwd) || isOffGrid(S.qRev)) scheduleRecompute();
}

// ===== Per-frame display updates =====
function updateKLDisplay(id, klVal) {
    const el = document.getElementById(id);
    const numEl = el.querySelector('.kl-num');
    numEl.textContent = fmtNum(klVal);
    const t = (Math.log10(Math.max(klVal, 1e-3)) - S.landVmin) / (S.landVmax - S.landVmin);
    numEl.style.borderBottomColor = heatmap(t);
}
function updateQParams(id, q) {
    const [a1, a2] = qToLand(q);
    const [n1, n2] = curP().axes;
    document.getElementById(id).textContent = n1 + '=' + fmtNum(a1) + '  ' + n2 + '=' + fmtNum(a2);
}

// ===== Animation loop =====
function frame(now) {
    // FPS counter (update every second)
    if (now - fpsLast >= 1000) {
        fpsVal = fpsFrames;
        fpsFrames = 0;
        fpsLast = now;
        document.getElementById('fps-display').textContent = fpsVal + ' steps/s';
    }

    // Accumulator-based stepping: accurate steps/sec regardless of frame rate
    const dt = lastFrameTime ? (now - lastFrameTime) : 0;
    lastFrameTime = now;
    if (!S.dragState && !S.landDragActive) {
        if (S.running) {
            stepsAccum += stepsPerSec * dt / 1000;
            const n = Math.min(Math.floor(stepsAccum), 256);  // cap to avoid death spiral
            stepsAccum -= n;
            for (let i = 0; i < n; i++) doStep();
        } else if (doOneStep) {
            doStep();
            doOneStep = false;
        }
    } else {
        stepsAccum = 0;  // reset accumulator while dragging
    }

    drawPanel(canvasFwd, S.qFwd, S.optFwd ? [S.optFwd] : null, S.lastFwd, 'fwd');
    drawPanel(canvasRev, S.qRev, S.optRev, S.lastRev, S.reverseMethod === 'reinforce' ? 'rf' : 'rev');

    drawLandscape(canvasLandFwd, S.landFwdGrid, S.qFwd, S.optFwd ? [S.optFwd] : null);
    drawLandscape(canvasLandRev, S.landRevGrid, S.qRev, S.optRev);

    updateKLDisplay('kl-fwd', divForward());
    updateKLDisplay('kl-rev', divReverse());
    updateQParams('q-params-fwd', S.qFwd);
    updateQParams('q-params-rev', S.qRev);

    requestAnimationFrame(frame);
}

// ===== Auto-shrink row labels and control rows to fit without wrapping =====
function fitRowLabels() {
    for (const el of document.querySelectorAll('.row-label, .control-row:not([style*="flex-wrap:wrap"])')) {
        el.style.fontSize = '';
        let size = parseFloat(getComputedStyle(el).fontSize);
        while (el.scrollWidth > el.clientWidth && size > 6) {
            size -= 0.5;
            el.style.fontSize = size + 'px';
        }
    }
}

// ===== Init: fetch DOM, wire controls, kick off the loop =====
export function init() {
    canvasFwd = document.getElementById('canvas-fwd');
    canvasRev = document.getElementById('canvas-rev');
    canvasLandFwd = document.getElementById('canvas-land-fwd');
    canvasLandRev = document.getElementById('canvas-land-rev');
    if (!canvasFwd) return;

    btnPlayPause = document.getElementById('btn-playpause');
    btnStep = document.getElementById('btn-step');
    sliderK = document.getElementById('slider-K');
    selectDiv = document.getElementById('select-divergence');
    selectParam = document.getElementById('select-parameterization');
    qFormulaEl = document.getElementById('q-formula');
    btnDeterministic = document.getElementById('btn-deterministic');
    btnMC = document.getElementById('btn-mc');
    btnReinforce = document.getElementById('btn-reinforce');
    btnReparam = document.getElementById('btn-reparam');
    sliderMix = document.getElementById('slider-mix');

    // Initial optima + landscapes (no DOM needed, but kept in init order)
    computeOptimal();
    computeLandscapes();

    // Canvas sizing + resize handling
    initCanvases();
    window.addEventListener('resize', initCanvases);

    // Distribution-panel + landscape interaction
    setupCanvas(canvasFwd, S.qFwd, () => S.optFwd ? [S.optFwd] : null);
    setupCanvas(canvasRev, S.qRev, () => S.optRev);
    setupLandscape(canvasLandFwd, S.qFwd, () => S.landFwdGrid);
    setupLandscape(canvasLandRev, S.qRev, () => S.landRevGrid);

    // ===== Controls =====
    btnPlayPause.addEventListener('click', function () {
        S.running = !S.running;
        updatePlayState();
    });
    btnStep.addEventListener('click', function () {
        if (!S.running) doOneStep = true;
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
        const mu0 = (Math.random() - 0.5) * 8;
        const sig0 = 0.3 + Math.random() * 2;
        const ls0 = Math.log(sig0);
        S.qFwd.mu = mu0; S.qFwd.logSigma = ls0;
        S.qRev.mu = mu0; S.qRev.logSigma = ls0;
        resetAdam();
    });

    sliderK.addEventListener('input', function () { setK(sliderToK(+this.value)); });
    document.getElementById('btn-K-minus').addEventListener('click', () => setK(S.K - 1));
    document.getElementById('btn-K-plus').addEventListener('click', () => setK(S.K + 1));

    document.getElementById('slider-speed').addEventListener('input', function () {
        stepsPerSec = speedFromSlider(+this.value);
    });

    document.getElementById('slider-lr').addEventListener('input', function () {
        S.baseLR = +this.value / 100;
        document.getElementById('val-lr').textContent = S.baseLR.toFixed(2);
    });

    sliderMix.addEventListener('input', function () {
        const w2 = +this.value / 100;
        document.getElementById('val-mix').textContent = w2.toFixed(2);
        S.pComps[0].w = 1 - w2;
        S.pComps[1].w = w2;
        S.lastFwd = null; S.lastRev = null;
        computeOptimal();
        computeLandscapes(LAND_RES_LO);  // fast low-res while dragging
    });
    sliderMix.addEventListener('change', function () {
        computeOptimal();
        computeLandscapes();  // full resolution on release
        resetAdam();
    });

    // Divergence type selector
    selectDiv.addEventListener('change', function () { setDivergence(this.value); });

    // Parameterization selector — populated from PARAMS registry
    for (const [key, param] of Object.entries(PARAMS)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = param.label;
        selectParam.appendChild(opt);
    }
    selectParam.value = S.landParam;
    window.renderQFormula = renderQFormula;
    renderQFormula();
    selectParam.addEventListener('change', function () {
        S.landParam = this.value;
        resetAdam();
        S.lastFwd = null; S.lastRev = null;
        renderQFormula();
        computeLandscapes();
    });

    // Natural gradient + gradient clipping toggles
    updateOptimizerNote();
    document.getElementById('chk-natgrad').addEventListener('change', function () {
        S.natGrad = this.checked;
        resetAdam();
    });
    document.getElementById('chk-gradclip').addEventListener('change', function () {
        S.gradClip = this.checked;
    });

    // Gradient mode toggle
    btnDeterministic.addEventListener('click', () => setGradientMode('deterministic'));
    btnMC.addEventListener('click', () => setGradientMode('mc'));

    // Reverse method toggle
    btnReinforce.addEventListener('click', function () {
        if (S.reverseMethod === 'reinforce') return;
        S.reverseMethod = 'reinforce';
        this.classList.add('active'); btnReparam.classList.remove('active');
        resetAdam();
    });
    btnReparam.addEventListener('click', function () {
        if (S.reverseMethod === 'reparam') return;
        S.reverseMethod = 'reparam';
        this.classList.add('active'); btnReinforce.classList.remove('active');
        resetAdam();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'Space') {
            e.preventDefault();
            S.running = !S.running;
            updatePlayState();
        } else if ((e.key === '>' || e.key === '.') && !S.running) {
            doOneStep = true;
        }
    });

    // Start the loop
    fpsLast = performance.now();
    requestAnimationFrame(frame);
    updateViaLabels();

    fitRowLabels();
    window.addEventListener('resize', fitRowLabels);
}
