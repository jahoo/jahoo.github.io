// ================================================================
//  SMC Resampling — main.js
//  State variables, interaction handlers, button wiring,
//  redrawAll, and initialization.
// ================================================================

import { N, MIN_W, METHOD_COLORS } from './config.js';
import {
    cumulativeSum,
    searchSorted,
    normalize,
    countIndices,
    getPos,
    resample,
    runTrials,
    evalEstimators,
    getTestFnLabel,
    getResidualPhase2,
    setResidualPhase2,
    getTestFnKey,
    setTestFnKey,
} from './algorithms.js';
import {
    drawPanel,
    drawMethodSection,
    drawResidualSection,
    drawBranchKillSection,
    drawComparisonPanel,
    drawEstDist,
    drawCompEstDist,
} from './drawing.js';
import { initToolbar } from './toolbar.js';

// ================================================================
//  STATE
// ================================================================

var weights = [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05];
var probes = [];       // [{u}] user-placed probes in section 2
var hoverU = null;     // current hover position on CDF (or null)

var dragProbeIdx = -1; // index of probe being dragged (-1 = none)

// Sections 3-5: per-method state
var sec3 = { probes: [], counts: null, hist: null, mode: 'none' };
var sec4 = { probes: [], counts: null, hist: null, mode: 'none' };
var sec5 = { probes: [], counts: null, hist: null, mode: 'none', offset: Math.random() / N, dragging: false };

// Section 6 residual
var sec6 = { detCounts: null, stoCounts: null, totalCounts: null, residualProbes: [], hist: null, mode: 'none' };

// Branch-kill
var secBK = { detCounts: null, bonusProbes: null, totalCounts: null, hist: null, mode: 'none' };

// Section 7 comparison
var compData = null;

// ================================================================
//  PUBLIC STATE ACCESSORS (for toolbar, particle-filter, etc.)
// ================================================================

export function getWeights() { return weights; }

// ================================================================
//  CANVAS REFERENCES
// ================================================================

var cvSec2 = document.getElementById('cv-sec2');
var cvSec3 = document.getElementById('cv-sec3');
var cvSec4 = document.getElementById('cv-sec4');
var cvSec5 = document.getElementById('cv-sec5');
var cvSec6 = document.getElementById('cv-sec6');
var cvBK   = document.getElementById('cv-bk');

// ================================================================
//  SECTION 2 — DRAWING
// ================================================================

function drawSection2() {
    var cs = cumulativeSum(weights); cs[N - 1] = 1.0;

    var probeCounts = null;
    if (probes.length > 0) {
        probeCounts = new Array(N).fill(0);
        for (var pi = 0; pi < probes.length; pi++)
            probeCounts[searchSorted(cs, probes[pi].u)]++;
    }

    drawPanel(cvSec2, {
        histValues: weights.slice(),
        histMax: Math.max.apply(null, weights) * 1.15,
        weights: weights,
        probeCountOverlay: probeCounts,
        probeCountTotal: probes.length,
        probes: probes,
        probeColor: '#333',
        hoverU: hoverU,
    });
    // In-canvas captions below plot
    var L = cvSec2._L;
    if (L) {
        var ctx = cvSec2.getContext('2d');
        var capFont = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.font = capFont;
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.6;
        var line1Y = L.plotB + 18;
        ctx.fillStyle = '#555';
        ctx.textAlign = 'left';
        ctx.fillText('Drag bars to adjust weights.', L.histL + 2, line1Y);
        ctx.fillStyle = '#555';
        ctx.fillText('Click plot to place probes.', L.cdfL, L.plotT - 10);
        cvSec2._clearProbeBtn = null;
        if (probes.length > 0) {
            var clearText = '\u00d7 Clear probes';
            var line3Y = L.plotB + 18;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#467';
            var tw = ctx.measureText(clearText).width;
            var clearX = L.cdfR - tw;
            ctx.fillText(clearText, clearX, line3Y);
            cvSec2._clearProbeBtn = { x: clearX, y: line3Y, w: tw, h: 12 };
        }
        ctx.globalAlpha = 1;
    }
}

// ================================================================
//  SECTION 2 — WEIGHT SETTER
// ================================================================

function setWeight(i, target) {
    target = Math.max(MIN_W, Math.min(1 - (N - 1) * MIN_W, target));
    var sumOthers = weights.reduce(function (s, wi, j) { return j === i ? s : s + wi; }, 0);
    if (sumOthers > 1e-10) {
        var scale = (1 - target) / sumOthers;
        for (var j = 0; j < N; j++) {
            if (j === i) weights[j] = target;
            else weights[j] = Math.max(MIN_W, weights[j] * scale);
        }
    } else {
        weights[i] = target;
        var rest = (1 - target) / (N - 1);
        for (var j = 0; j < N; j++) if (j !== i) weights[j] = rest;
    }
    normalize(weights);
}

// ================================================================
//  SHARED: weight dragging from ANY panel canvas
// ================================================================

var globalWeightDrag = { active: false, idx: -1, canvas: null };

function initWeightDrag(canvas) {
    function onDown(e) {
        var L = canvas._L; if (!L) return;
        var pos = getPos(canvas, e);

        // Check CDF boundary circles first
        if (pos.x >= L.cdfL - 10 && pos.x <= L.cdfR + 10) {
            var cs = cumulativeSum(weights);
            for (var i = 0; i < N - 1; i++) {
                var bx = L.uToX(cs[i]);
                var by = L.idxToY(i);
                if (Math.abs(pos.x - bx) < 10 && Math.abs(pos.y - by) < 12) {
                    globalWeightDrag = { active: true, idx: i, canvas: canvas, type: 'cdf' };
                    e.preventDefault();
                    return;
                }
            }
        }

        // Check histogram bar area
        if (pos.x <= L.histR + 5) {
            for (var i = 0; i < N; i++) {
                var y = L.idxToY(i);
                if (Math.abs(pos.y - y) < L.barH / 2 + 3) {
                    globalWeightDrag = { active: true, idx: i, canvas: canvas, type: 'hist' };
                    e.preventDefault();
                    return;
                }
            }
        }
    }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
}

// Global move/up for weight drag AND CDF boundary drag
function handleWeightDragMove(e) {
    if (!globalWeightDrag.active) return;
    e.preventDefault();
    var L = globalWeightDrag.canvas._L; if (!L) return;
    var pos = getPos(globalWeightDrag.canvas, e);

    if (globalWeightDrag.type === 'hist') {
        var barW = Math.max(0, L.histR - pos.x);
        var maxVal = L.histMaxVal || Math.max.apply(null, weights) * 1.15;
        var newW = Math.max(MIN_W, (barW / L.histW) * maxVal);
        setWeight(globalWeightDrag.idx, newW);
    } else if (globalWeightDrag.type === 'cdf') {
        var u = L.xToU(pos.x);
        var cs = cumulativeSum(weights);
        var idx = globalWeightDrag.idx;
        var lo = (idx === 0 ? 0 : cs[idx - 1]) + MIN_W;
        var hi = (idx === N - 1 ? 1 : cs[idx + 1]) - MIN_W;
        var newF = Math.max(lo, Math.min(hi, u));
        var prevF = idx === 0 ? 0 : cs[idx - 1];
        weights[idx] = newF - prevF;
        if (idx < N - 1) {
            var nextF = cs[idx + 1];
            weights[idx + 1] = nextF - newF;
        }
        for (var i = 0; i < N; i++) weights[i] = Math.max(MIN_W, weights[i]);
        normalize(weights);
    }
    redrawAll();
}
window.addEventListener('mousemove', handleWeightDragMove);
window.addEventListener('touchmove', handleWeightDragMove, { passive: false });
window.addEventListener('mouseup', function () { globalWeightDrag.active = false; });
window.addEventListener('touchend', function () { globalWeightDrag.active = false; });

// ================================================================
//  SECTION 2 — INTERACTION (probes + hover)
// ================================================================

function initSec2Events(canvas) {
    var mouseIsDown = false;
    var downPos = null;

    function hitTestProbe(L, pos) {
        for (var i = 0; i < probes.length; i++) {
            var px = L.uToX(probes[i].u);
            if (Math.abs(pos.x - px) < 10 && pos.y >= L.plotB - 5 && pos.y <= L.plotB + 15) return i;
        }
        return -1;
    }

    function onDown(e) {
        var L = canvas._L;
        if (!L) return;
        var pos = getPos(canvas, e);

        // Check clear-probes button (drawn in caption area)
        var cb = canvas._clearProbeBtn;
        if (cb && pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y - 2 && pos.y <= cb.y + cb.h + 2) {
            e.preventDefault();
            probes = [];
            redrawAll();
            return;
        }

        if (pos.x <= L.histR + 5) return;

        e.preventDefault();
        mouseIsDown = true;
        downPos = pos;

        var pi = hitTestProbe(L, pos);
        if (pi >= 0) { dragProbeIdx = pi; return; }
    }

    function onMove(e) {
        var L = canvas._L;
        if (!L) return;
        var pos = getPos(canvas, e);

        if (dragProbeIdx >= 0) {
            e.preventDefault();
            probes[dragProbeIdx].u = L.xToU(pos.x);
            redrawAll();
            return;
        }

        // Cursor for clear-probes button
        var cb = canvas._clearProbeBtn;
        if (cb && pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y - 2 && pos.y <= cb.y + cb.h + 2) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = '';
        }

        if (!globalWeightDrag.active && pos.x >= L.cdfL && pos.x <= L.cdfR && pos.y >= L.plotT && pos.y <= L.plotB + 10) {
            hoverU = L.xToU(pos.x);
        } else {
            hoverU = null;
        }
        redrawAll();
    }

    function onUp(e) {
        if (!mouseIsDown) return;
        mouseIsDown = false;
        var L = canvas._L;

        if (dragProbeIdx >= 0) { dragProbeIdx = -1; redrawAll(); return; }

        if (L && downPos) {
            var pos = getPos(canvas, e);
            if (pos.x >= L.cdfL && pos.x <= L.cdfR) {
                if (Math.hypot(pos.x - downPos.x, pos.y - downPos.y) < 5) {
                    var u = L.xToU(pos.x);
                    if (u >= 0 && u <= 1) {
                        if (probes.length >= N) probes.shift();
                        probes.push({ u: u });
                        redrawAll();
                    }
                }
            }
        }
        downPos = null;
    }

    function onLeave() {
        hoverU = null;
        redrawAll();
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    canvas.addEventListener('mouseleave', onLeave);
}

/** Set innerHTML of an element and queue MathJax typesetting. */
function setMathHTML(id, html) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]);
}

// ================================================================
//  REDRAW ALL
// ================================================================

function redrawAll() {
    drawSection2();
    // Section 3
    drawMethodSection(cvSec3, sec3, METHOD_COLORS.multinomial, null, weights);
    // Section 4
    drawMethodSection(cvSec4, sec4, METHOD_COLORS.stratified, { strata: true }, weights);
    // Section 5 -- always build comb probes from offset, but only
    // show empirical histogram when mode is 'single' or 'ktrials'
    var sysProbes = [];
    for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
    sec5.probes = sysProbes;
    drawMethodSection(cvSec5, sec5, METHOD_COLORS.systematic, { comb: true, strata: true, strataColor: 'rgba(39,174,96,' }, weights);
    // Section 6
    drawResidualSection(cvSec6, sec6, weights);
    // Branch-kill
    drawBranchKillSection(cvBK, secBK, weights);
    // Section 7
    drawComparisonPanel(weights, compData);
    // Estimator distributions for sections 3-6
    drawEstDist('cv-est-multi', sec3, METHOD_COLORS.multinomial, 'Multinomial', weights);
    drawEstDist('cv-est-strat', sec4, METHOD_COLORS.stratified, 'Stratified', weights);
    drawEstDist('cv-est-sys',   sec5, METHOD_COLORS.systematic, 'Systematic', weights);
    var p2 = getResidualPhase2() || 'multinomial';
    var p2Short = { multinomial: 'Multi', stratified: 'Strat', systematic: 'Syst' };
    drawEstDist('cv-est-resid', sec6, METHOD_COLORS.residual, 'Resid-' + (p2Short[p2] || p2), weights);
    drawEstDist('cv-est-bk',   secBK, METHOD_COLORS.branchkill, 'Branch-kill', weights);
    // Section 7 overlaid distributions
    drawCompEstDist(compData, weights);
    // Toolbar is updated by toolbar.js
}

// ================================================================
//  INITIALIZATION — EVENT WIRING
// ================================================================

initSec2Events(cvSec2);

// Attach weight drag to ALL panel canvases
var cvComparison = document.getElementById('cv-comparison');
[cvSec2, cvSec3, cvSec4, cvSec5, cvSec6, cvBK, cvComparison].forEach(function (c) { if (c) initWeightDrag(c); });

// ---- Section 5 comb drag ----
(function () {
    function onDown(e) {
        var L = cvSec5._L; if (!L) return;
        var pos = getPos(cvSec5, e);
        var hx = L.uToX(sec5.offset);
        if (Math.abs(pos.x - hx) < 15 && pos.y > L.plotB - 10) {
            sec5.dragging = true; e.preventDefault();
        }
    }
    function onMove(e) {
        if (!sec5.dragging) return;
        e.preventDefault();
        var L = cvSec5._L; if (!L) return;
        sec5.offset = Math.max(0, Math.min(1 / N - 1e-9, L.xToU(getPos(cvSec5, e).x)));
        sec5.mode = 'single';
        var cs = cumulativeSum(weights); cs[N - 1] = 1.0;
        var sysProbes = [];
        for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
        sec5.probes = sysProbes;
        sec5.counts = countIndices(sysProbes.map(function (p) { return searchSorted(cs, p.u); }), N);
        redrawAll();
    }
    function onUp() { sec5.dragging = false; }
    cvSec5.addEventListener('mousedown', onDown);
    cvSec5.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
})();

// ---- Helper: resample-once for a method section ----
function doResampleOnce(sec, method) {
    var cs = cumulativeSum(weights); cs[N - 1] = 1.0;
    var draws = Array.from({ length: N }, function () { return Math.random(); });
    sec.probes = draws.map(function (u) { return { u: u }; });
    var indices = method(weights);
    sec.counts = countIndices(indices, N);
    if (method === resample.multinomial) {
        sec.probes = draws.map(function (u) { return { u: u }; });
        sec.counts = countIndices(draws.map(function (u) { return searchSorted(cs, u); }), N);
    } else if (method === resample.stratified) {
        var ps = Array.from({ length: N }, function (_, k) { return (Math.random() + k) / N; });
        sec.probes = ps.map(function (u) { return { u: u }; });
        sec.counts = countIndices(ps.map(function (u) { return searchSorted(cs, u); }), N);
    }
    sec.mode = 'single';
}

// ---- Helper: wire a method section's buttons ----
function wireMethodButtons(prefix, sec, method) {
    document.getElementById('btn-resample-' + prefix).addEventListener('click', function () {
        doResampleOnce(sec, method);
        redrawAll();
    });
    document.getElementById('btn-clear-' + prefix).addEventListener('click', function () {
        sec.probes = []; sec.counts = null; sec.hist = null; sec.mode = 'none';
        document.getElementById('var-' + prefix).textContent = '';
        var estEl = document.getElementById('est-' + prefix);
        if (estEl) estEl.classList.remove('visible');
        redrawAll();
    });
    var slider = document.getElementById('slider-K-' + prefix);
    var valSpan = document.getElementById('val-K-' + prefix);
    slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    document.getElementById('btn-run-' + prefix).addEventListener('click', function () {
        var K = parseInt(slider.value, 10);
        sec.hist = runTrials(method, K, weights);
        sec.mode = 'ktrials';
        sec.probes = [];
        var ev = evalEstimators(sec.hist, weights);
        var estStd = ev ? Math.sqrt(ev.estVar) : 0;
        setMathHTML('var-' + prefix,
            'std of estimator ' + getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
        var estEl = document.getElementById('est-' + prefix);
        if (estEl) estEl.classList.add('visible');
        redrawAll();
    });
}

// Section 3
wireMethodButtons('multi', sec3, resample.multinomial);
// Section 4
wireMethodButtons('strat', sec4, resample.stratified);

// Section 5
document.getElementById('btn-resample-sys').addEventListener('click', function () {
    sec5.offset = Math.random() / N;
    sec5.mode = 'single';
    var cs = cumulativeSum(weights); cs[N - 1] = 1.0;
    var sysProbes = [];
    for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
    sec5.probes = sysProbes;
    sec5.counts = countIndices(sysProbes.map(function (p) { return searchSorted(cs, p.u); }), N);
    redrawAll();
});
document.getElementById('btn-clear-sys').addEventListener('click', function () {
    sec5.counts = null; sec5.hist = null; sec5.mode = 'none';
    document.getElementById('var-sys').textContent = '';
    var estEl = document.getElementById('est-sys');
    if (estEl) estEl.classList.remove('visible');
    redrawAll();
});
(function () {
    var slider = document.getElementById('slider-K-sys');
    var valSpan = document.getElementById('val-K-sys');
    slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    document.getElementById('btn-run-sys').addEventListener('click', function () {
        var K = parseInt(slider.value, 10);
        sec5.hist = runTrials(resample.systematic, K, weights);
        sec5.mode = 'ktrials';
        sec5.probes = [];
        var ev = evalEstimators(sec5.hist, weights);
        var estStd = ev ? Math.sqrt(ev.estVar) : 0;
        setMathHTML('var-sys',
            'std of estimator ' + getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
        var estEl = document.getElementById('est-sys');
        if (estEl) estEl.classList.add('visible');
        redrawAll();
    });
})();

// Counterexample buttons
var counterPreWeights = null;
var counterPreTestFn = null;
var btnSetCounter = document.getElementById('btn-set-counterexample');
var btnResetCounter = document.getElementById('btn-reset-counterexample');
if (btnSetCounter) {
    btnSetCounter.addEventListener('click', function () {
        counterPreWeights = weights.slice();
        counterPreTestFn = getTestFnKey();
        weights = PRESETS.alternating();
        setTestFnKey('evenodd');
        document.querySelectorAll('.testfn-select').forEach(function (s) { s.value = 'evenodd'; });
        clearAll();
        redrawAll();
        if (btnResetCounter) btnResetCounter.style.display = 'inline';
    });
}
if (btnResetCounter) {
    btnResetCounter.addEventListener('click', function () {
        if (counterPreWeights) {
            weights = counterPreWeights;
            counterPreWeights = null;
        }
        if (counterPreTestFn) {
            setTestFnKey(counterPreTestFn);
            document.querySelectorAll('.testfn-select').forEach(function (s) { s.value = counterPreTestFn; });
            counterPreTestFn = null;
        }
        clearAll();
        redrawAll();
        btnResetCounter.style.display = 'none';
    });
}

// Section 6 residual
document.getElementById('btn-resample-resid').addEventListener('click', function () {
    var p2 = getResidualPhase2();
    var copies = weights.map(function (wi) { return Math.floor(N * wi); });
    var R = N - copies.reduce(function (a, b) { return a + b; }, 0);
    var res = weights.map(function (wi, i) { return wi - copies[i] / N; });
    var resSum = res.reduce(function (a, b) { return a + b; }, 0);
    var normRes = resSum > 0 ? res.map(function (r) { return r / resSum; }) : weights.slice();
    var cs = cumulativeSum(normRes); cs[N - 1] = 1.0;

    var residualProbes = [];
    if (p2 === 'stratified') {
        for (var k = 0; k < R; k++) residualProbes.push({ u: (Math.random() + k) / R });
    } else if (p2 === 'systematic') {
        var u0 = Math.random() / R;
        for (var k = 0; k < R; k++) residualProbes.push({ u: u0 + k / R });
    } else {
        for (var k = 0; k < R; k++) residualProbes.push({ u: Math.random() });
    }

    var stoCounts = new Array(N).fill(0);
    for (var i = 0; i < residualProbes.length; i++) {
        stoCounts[searchSorted(cs, residualProbes[i].u)]++;
    }
    var totalCounts = copies.map(function (d, i) { return d + stoCounts[i]; });

    sec6.detCounts = copies;
    sec6.stoCounts = stoCounts;
    sec6.totalCounts = totalCounts;
    sec6.residualProbes = residualProbes;
    sec6.mode = 'single';
    redrawAll();
});
// Phase-2 method selector
document.getElementById('select-resid-phase2').addEventListener('change', function (e) {
    setResidualPhase2(e.target.value);
    var commentEl = document.getElementById('resid-phase2-comment');
    var codeEl = document.getElementById('resid-phase2-code');
    if (commentEl && codeEl) {
        commentEl.textContent = getResidualPhase2();
        var codeLines = {
            multinomial: 'positions = random(R)                               <span class="c1"># multinomial: R independent probes</span>',
            stratified:  'positions = (random(R) + range(R)) / R              <span class="c1"># stratified: one probe per stratum</span>',
            systematic:  'positions = (random() + np.arange(R)) / R           <span class="c1"># systematic: single-offset comb</span>',
        };
        codeEl.innerHTML = codeLines[getResidualPhase2()] || codeLines.multinomial;
    }
    sec6.detCounts = null; sec6.stoCounts = null; sec6.totalCounts = null;
    sec6.residualProbes = []; sec6.hist = null; sec6.mode = 'none';
    document.getElementById('var-resid').textContent = '';
    var estEl = document.getElementById('est-resid');
    if (estEl) estEl.classList.remove('visible');
    redrawAll();
});

document.getElementById('btn-clear-resid').addEventListener('click', function () {
    sec6.detCounts = null; sec6.stoCounts = null; sec6.totalCounts = null;
    sec6.residualProbes = []; sec6.hist = null; sec6.mode = 'none';
    document.getElementById('var-resid').textContent = '';
    var estEl = document.getElementById('est-resid');
    if (estEl) estEl.classList.remove('visible');
    redrawAll();
});
(function () {
    var slider = document.getElementById('slider-K-resid');
    var valSpan = document.getElementById('val-K-resid');
    slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    document.getElementById('btn-run-resid').addEventListener('click', function () {
        var K = parseInt(slider.value, 10);
        sec6.hist = runTrials(function (w) { return resample.residual(w, getResidualPhase2()); }, K, weights);
        sec6.mode = 'ktrials';
        var ev = evalEstimators(sec6.hist, weights);
        var estStd = ev ? Math.sqrt(ev.estVar) : 0;
        setMathHTML('var-resid',
            'std of estimator ' + getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
        var estEl = document.getElementById('est-resid');
        if (estEl) estEl.classList.add('visible');
        redrawAll();
    });
})();

// Branch-kill
document.getElementById('btn-resample-bk').addEventListener('click', function () {
    var det = weights.map(function (wi) { return Math.floor(N * wi); });
    var bonusProbes = weights.map(function (wi, i) {
        var p = N * wi - det[i];
        var u = Math.random();
        return { u: u, p: p, hit: u >= 1 - p };
    });
    var total = det.map(function (d, i) { return d + (bonusProbes[i].hit ? 1 : 0); });
    secBK.detCounts = det;
    secBK.bonusProbes = bonusProbes;
    secBK.totalCounts = total;
    secBK.hist = null;
    secBK.mode = 'single';
    redrawAll();
});
document.getElementById('btn-clear-bk').addEventListener('click', function () {
    secBK.detCounts = null; secBK.bonusProbes = null; secBK.totalCounts = null;
    secBK.hist = null; secBK.mode = 'none';
    document.getElementById('var-bk').textContent = '';
    var estEl = document.getElementById('est-bk');
    if (estEl) estEl.classList.remove('visible');
    redrawAll();
});
(function () {
    var slider = document.getElementById('slider-K-bk');
    var valSpan = document.getElementById('val-K-bk');
    slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    document.getElementById('btn-run-bk').addEventListener('click', function () {
        var K = parseInt(slider.value, 10);
        secBK.hist = runTrials(resample.branchkill, K, weights);
        secBK.mode = 'ktrials';
        var ev = evalEstimators(secBK.hist, weights);
        var estStd = ev ? Math.sqrt(ev.estVar) : 0;
        setMathHTML('var-bk',
            'std of estimator ' + getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
        var estEl = document.getElementById('est-bk');
        if (estEl) estEl.classList.add('visible');
        redrawAll();
    });
})();

// Section 7 comparison
(function () {
    var slider = document.getElementById('slider-K-all');
    var valSpan = document.getElementById('val-K-all');
    slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    document.getElementById('btn-run-all').addEventListener('click', function () {
        var K = parseInt(slider.value, 10);
        setTimeout(function () {
            compData = {
                multi: runTrials(resample.multinomial, K, weights),
                strat: runTrials(resample.stratified, K, weights),
                sys:   runTrials(resample.systematic, K, weights),
                resid: runTrials(function (w) { return resample.residual(w, getResidualPhase2()); }, K, weights),
            };
            ['multi', 'strat', 'sys', 'resid'].forEach(function (key) {
                var ev = evalEstimators(compData[key], weights);
                var std = ev ? Math.sqrt(ev.estVar).toFixed(4) : '\u2014';
                document.getElementById('comp-std-' + key).textContent = std;
            });
            var estEl = document.getElementById('est-comparison');
            if (estEl) estEl.classList.add('visible');
            redrawAll();
        }, 0);
    });
})();

// Test function selectors
var testFnOptions = [
    { value: 'position', label: 'i/N  (mean position)' },
    { value: 'indicator', label: '1[i=4]  (single particle)' },
    { value: 'tail', label: '1[i\u22655]  (upper tail)' },
    { value: 'square', label: '(i/N)\u00B2  (squared position)' },
    { value: 'evenodd', label: '1[i even]  (even/odd class)' },
];
var allTestFnSelects = document.querySelectorAll('.testfn-select');
allTestFnSelects.forEach(function (sel) {
    testFnOptions.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
    });
    sel.value = getTestFnKey();
    sel.addEventListener('change', function (e) {
        setTestFnKey(e.target.value);
        allTestFnSelects.forEach(function (s) { s.value = getTestFnKey(); });
        [['multi', sec3], ['strat', sec4], ['sys', sec5], ['resid', sec6]].forEach(function (pair) {
            var prefix = pair[0], sec = pair[1];
            if (sec.hist && sec.hist.allCounts) {
                var ev = evalEstimators(sec.hist, weights);
                if (ev) {
                    setMathHTML('var-' + prefix,
                        'std of estimator ' + getTestFnLabel() + ' = ' + Math.sqrt(ev.estVar).toFixed(4) + '  (' + sec.hist.K + ' trials)');
                }
            }
        });
        if (compData) {
            ['multi', 'strat', 'sys', 'resid'].forEach(function (key) {
                var ev = evalEstimators(compData[key], weights);
                if (ev) {
                    var std = Math.sqrt(ev.estVar).toFixed(4);
                    document.getElementById('comp-var-' + key).textContent = 'std=' + std;
                    document.getElementById('td-var-' + key).textContent = std;
                    document.getElementById('comp-std-' + key).textContent = std;
                }
            });
        }
        if (secBK.hist) {
            var evBK = evalEstimators(secBK.hist, weights);
            if (evBK) setMathHTML('var-bk',
                'std of estimator ' + getTestFnLabel() + ' = ' + Math.sqrt(evBK.estVar).toFixed(4) + '  (' + secBK.hist.K + ' trials)');
        }
        setTimeout(redrawAll, 0);
    });
});

// Section 2 presets
function clearAll() {
    probes = [];
    [sec3, sec4, sec5, sec6].forEach(function (s) {
        s.probes = []; s.counts = null; s.hist = null; s.mode = 'none';
        if (s.offset !== undefined) s.offset = 0.5 / N;
    });
    compData = null;
    document.querySelectorAll('.var-display').forEach(function (el) { el.textContent = ''; });
}

var PRESETS = {
    uniform: function () { return new Array(N).fill(1 / N); },
    skewed: function () { return [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]; },
    degenerate: function () { return [0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.89]; },
    alternating: function () { var w = []; for (var i = 0; i < N; i++) w.push(i % 2 === 0 ? 0.20 : 0.05); normalize(w); return w; },
};

// Resize
var resizeTimer;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 100);
});

// Listen for preset changes from toolbar.js
document.addEventListener('smc-preset-change', function (e) {
    var key = e.detail;
    if (PRESETS[key]) {
        weights = PRESETS[key]();
        clearAll();
        redrawAll();
    }
});

// Init toolbar
initToolbar({ getWeights: getWeights });

// ================================================================
//  EXPORT init() for entry point
// ================================================================

export function init() {
    redrawAll();
}
