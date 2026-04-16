// ================================================================
//  SMC Resampling — pf-instances.js
//  Creates the three particle filter visualization instances:
//  1. Degeneracy intro (marginnote, SIS/SMC toggle)
//  2. Full comparison (end-of-post, method selector, seed, diagnostics)
//  3. K-trials comparison (N/K sliders, all methods)
//
//  Extracted from the original particle-filter.js IIFEs.
// ================================================================

import { createPFViz } from './particle-filter.js';
import { N, METHOD_COLORS } from './config.js';
import * as alg from './algorithms.js';

// ================================================================
//  1. DEGENERACY INTRO INSTANCE (marginnote)
// ================================================================

function initDegenViz() {
    var chkResample = document.getElementById('chk-degen-resample');
    var captionSpan = document.getElementById('degen-caption');

    function updateCaption() {
        var doResample = chkResample && chkResample.checked;
        var sisLabel = document.getElementById('degen-label-sis');
        var smcLabel = document.getElementById('degen-label-smc');
        if (sisLabel) sisLabel.className = 'degen-toggle-label' + (doResample ? '' : ' active');
        if (smcLabel) smcLabel.className = 'degen-toggle-label' + (doResample ? ' active' : '');
        if (!captionSpan) return;
        captionSpan.textContent = doResample
            ? 'With resampling (SMC), we avoid weight degeneracy.'
            : 'Without resampling (SIS), weights often become degenerate.';
    }

    var viz = createPFViz({
        canvasId: 'cv-degeneracy',
        rerunBtnId: 'btn-degen-rerun',
        getResampleFn: function () {
            if (chkResample && chkResample.checked) {
                return function (w) { return alg.resample.multinomial(w); };
            }
            return null;
        },
        nSteps: 8,
        model: { sigmaProc: 1.0, sigmaObs: 0.5, yObs: 2.0 },
        onRun: updateCaption
    });

    if (!viz) return;
    updateCaption();

    if (chkResample) {
        chkResample.addEventListener('change', function () { viz.run(); });
    }

    // Redraw when marginnote toggle reveals canvas (narrow mode)
    var toggle = document.getElementById('mn-degen');
    if (toggle) toggle.addEventListener('change', function () {
        setTimeout(function () { viz.draw(); }, 50);
    });
}

// ================================================================
//  2. END-OF-POST INSTANCE (method comparison)
// ================================================================

function initCompareViz() {
    var methodSelect = document.getElementById('select-pf-method');
    var chkSeed = document.getElementById('chk-pf-seed');
    var inputSeed = document.getElementById('input-pf-seed');
    if (!methodSelect) return;

    // Show/hide seed input
    if (chkSeed && inputSeed) {
        chkSeed.addEventListener('change', function () {
            inputSeed.style.display = chkSeed.checked ? 'inline' : 'none';
        });
    }

    function getResampleFn() {
        var method = methodSelect.value;
        switch (method) {
            case 'stratified':  return function (w) { return alg.resample.stratified(w); };
            case 'systematic':  return function (w) { return alg.resample.systematic(w); };
            case 'residual':    return function (w) { return alg.resample.residual(w, alg.getResidualPhase2()); };
            default:            return function (w) { return alg.resample.multinomial(w); };
        }
    }

    function getSeed() {
        if (chkSeed && chkSeed.checked && inputSeed) {
            return parseInt(inputSeed.value, 10) || 42;
        }
        return null;
    }

    // Count unique ancestors at t=0 for all particles at step t
    function countUniqueAncestors(history, targetT) {
        var ancestors = {};
        for (var i = 0; i < N; i++) {
            var idx = i;
            for (var t = targetT; t > 0; t--) {
                var anc = history[t].ancestors;
                idx = anc ? anc[idx] : idx;
            }
            ancestors[idx] = true;
        }
        return Object.keys(ancestors).length;
    }

    // Diagnostic plots
    var cvDiag = document.getElementById('cv-pf-diagnostics');

    function drawDiagnostics(history) {
        if (!cvDiag) return;
        var dpr = window.devicePixelRatio || 1;
        var W = cvDiag.clientWidth, H = cvDiag.clientHeight;
        if (W === 0 || H === 0) return;
        cvDiag.width = Math.round(W * dpr);
        cvDiag.height = Math.round(H * dpr);
        var ctx = cvDiag.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);

        var nT = history.length;
        if (nT === 0) return;

        var margin = { left: 22, right: 6, top: 12, bottom: 4 };
        var pL = margin.left, pR = W - margin.right, pW = pR - pL;
        var nCols = nT;

        var ancValues = [];
        for (var t = 0; t < nT; t++) ancValues.push(countUniqueAncestors(history, t));

        var panelTop = margin.top;
        var panelBot = H - margin.bottom;
        var pH = panelBot - panelTop;
        var color = '#2c3e50';

        ctx.fillStyle = color; ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Unique ancestors at t=1 (low \u21d2 path degeneracy)', pL + 2, panelTop - 1);

        ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pL, panelBot); ctx.lineTo(pR, panelBot); ctx.stroke();

        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        var first = true;
        for (var t = 1; t < nCols; t++) {
            var x = pL + (t + 0.5) / nCols * pW;
            var y = panelBot - (ancValues[t] / N) * pH;
            if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        for (var t = 1; t < nCols; t++) {
            var x = pL + (t + 0.5) / nCols * pW;
            var y = panelBot - (ancValues[t] / N) * pH;
            ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 2 * Math.PI); ctx.fill();
            ctx.font = '7px -apple-system, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(ancValues[t].toString(), x, y - 3);
        }
        ctx.globalAlpha = 1;
    }

    var viz = createPFViz({
        canvasId: 'cv-pf-compare',
        rerunBtnId: 'btn-pf-rerun',
        getResampleFn: getResampleFn,
        getSeed: getSeed,
        showESS: true,
        nSteps: 8,
        model: { sigmaProc: 1.0, sigmaObs: 0.5, yObs: 2.0 },
        onRun: function (history) { drawDiagnostics(history); }
    });

    if (!viz) return;

    methodSelect.addEventListener('change', function () { viz.run(); });
    if (inputSeed) inputSeed.addEventListener('change', function () { viz.run(); });

    // Keep residual option label in sync with phase-2 selector
    var p2Short = { multinomial: 'Multi', stratified: 'Strat', systematic: 'Syst' };
    function updateResidualLabel() {
        var opt = methodSelect.querySelector('option[value="residual"]');
        if (opt) opt.textContent = 'Residual-' + (p2Short[alg.getResidualPhase2()] || 'Multi');
    }
    updateResidualLabel();
    var mainP2 = document.getElementById('select-resid-phase2');
    if (mainP2) mainP2.addEventListener('change', function () { updateResidualLabel(); });
    var toolbarP2 = document.getElementById('smc-toolbar-phase2-select');
    if (toolbarP2) toolbarP2.addEventListener('change', function () { updateResidualLabel(); });
}

// ================================================================
//  3. K-TRIALS COMPARISON
// ================================================================

function initKTrials() {
    var cvK = document.getElementById('cv-pf-ktrials');
    var btnRun = document.getElementById('btn-pf-ktrials');
    var sliderN = document.getElementById('slider-pf-N');
    var sliderK = document.getElementById('slider-pf-K');
    var valN = document.getElementById('val-pf-N');
    var valK = document.getElementById('val-pf-K');
    if (!cvK || !btnRun) return;

    if (sliderN) sliderN.addEventListener('input', function () { valN.textContent = sliderN.value; });
    if (sliderK) sliderK.addEventListener('input', function () { valK.textContent = sliderK.value; });

    var T = 8;
    var sigmaProc = 1.0, sigmaObs = 0.5, yObs = 2.0;

    function randn() {
        var u1 = Math.random(), u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    function gaussLogLik(x, mu, sigma) {
        var z = (x - mu) / sigma; return -0.5 * z * z;
    }

    function runOnePF(nP, resampleFn) {
        var states = [], logW = [];
        for (var i = 0; i < nP; i++) {
            states.push(randn() * sigmaProc);
            logW.push(gaussLogLik(yObs, states[i], sigmaObs));
        }
        var maxLW = Math.max.apply(null, logW);
        var w = logW.map(function (lw) { return Math.exp(lw - maxLW); });
        var s = w.reduce(function (a, b) { return a + b; }, 0);
        w = w.map(function (v) { return v / s; });

        var history = [{ weights: w, ancestors: null }];

        for (var t = 1; t <= T; t++) {
            var ancestors = resampleFn(w);
            var curStates = ancestors.map(function (a) { return states[a]; });
            var newStates = curStates.map(function (x) { return x + randn() * sigmaProc; });
            var newLogW = newStates.map(function (x) { return gaussLogLik(yObs, x, sigmaObs); });
            var newMaxLW = Math.max.apply(null, newLogW);
            var newW = newLogW.map(function (lw) { return Math.exp(lw - newMaxLW); });
            var newS = newW.reduce(function (a, b) { return a + b; }, 0);
            newW = newW.map(function (v) { return v / newS; });
            history.push({ weights: newW, ancestors: ancestors });
            states = newStates;
            w = newW;
        }

        var essPerStep = [], ancPerStep = [];
        for (var t = 0; t <= T; t++) {
            var wt = history[t].weights;
            essPerStep.push(1 / wt.reduce(function (s, wi) { return s + wi * wi; }, 0));
            var ancs = {};
            for (var i = 0; i < nP; i++) {
                var idx = i;
                for (var tt = t; tt > 0; tt--) {
                    idx = history[tt].ancestors[idx];
                }
                ancs[idx] = true;
            }
            ancPerStep.push(Object.keys(ancs).length);
        }
        return { ess: essPerStep, anc: ancPerStep };
    }

    function runAllMethods() {
        var nP = parseInt(sliderN.value, 10) || 8;
        var K = parseInt(sliderK.value, 10) || 50;

        var methods = [
            { name: 'Multinomial', color: METHOD_COLORS.multinomial, fn: function (w) { return alg.resample.multinomial(w); } },
            { name: 'Stratified', color: METHOD_COLORS.stratified, fn: function (w) { return alg.resample.stratified(w); } },
            { name: 'Systematic', color: METHOD_COLORS.systematic, fn: function (w) { return alg.resample.systematic(w); } },
            { name: 'Resid-' + ({multinomial:'Multi',stratified:'Strat',systematic:'Syst'}[alg.getResidualPhase2()] || 'Multi'),
              color: METHOD_COLORS.residual, fn: function (w) { return alg.resample.residual(w, alg.getResidualPhase2()); } },
        ];

        var results = methods.map(function (m) {
            var runs = [];
            for (var k = 0; k < K; k++) runs.push(runOnePF(nP, m.fn));
            return { name: m.name, color: m.color, runs: runs };
        });

        drawKTrials(results, nP, K);
    }

    function drawKTrials(results, nP, K) {
        var dpr = window.devicePixelRatio || 1;
        var W = cvK.clientWidth, H = cvK.clientHeight;
        if (W === 0 || H === 0) return;
        cvK.width = Math.round(W * dpr);
        cvK.height = Math.round(H * dpr);
        var ctx = cvK.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);

        var margin = { top: 12, bottom: 16, left: 22, right: 6 };
        var pL = margin.left, pR = W - margin.right;
        var pW = pR - pL;
        var nCols = T + 1;

        var dataMax = 0;
        for (var m = 0; m < results.length; m++) {
            for (var k = 0; k < K; k++) {
                for (var t = 1; t < nCols; t++) {
                    var v = results[m].runs[k].anc[t];
                    if (v > dataMax) dataMax = v;
                }
            }
        }
        var maxY = Math.max(nP / 2, Math.min(nP, dataMax * 1.1));

        var colW = pW / nCols;
        var panelTop = margin.top;
        var panelBot = H - margin.bottom;
        var panelH = panelBot - panelTop;
        var startT = 1;

        ctx.fillStyle = '#666'; ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Unique ancestors at t=1, as proportion of N (low \u21d2 path degeneracy)', pL + 2, panelTop - 1);

        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pL, panelBot); ctx.lineTo(pR, panelBot); ctx.stroke();

        ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        var yTicks = [0.25, 0.5, 0.75, 1.0];
        for (var yi = 0; yi < yTicks.length; yi++) {
            var propVal = yTicks[yi] * nP;
            if (propVal > maxY) continue;
            var yy = panelBot - (propVal / maxY) * panelH;
            ctx.beginPath(); ctx.moveTo(pL, yy); ctx.lineTo(pR, yy); ctx.stroke();
        }
        ctx.setLineDash([]);

        ctx.fillStyle = '#bbb'; ctx.font = '7px -apple-system, sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (var yi = 0; yi < yTicks.length; yi++) {
            var propVal = yTicks[yi] * nP;
            if (propVal > maxY) continue;
            var yy = panelBot - (propVal / maxY) * panelH;
            ctx.fillText((yTicks[yi] * 100).toFixed(0) + '%', pL - 2, yy);
        }
        ctx.fillText('0%', pL - 2, panelBot);

        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#999';
        for (var t = 0; t < nCols; t++) {
            ctx.fillText(t + 1, pL + (t + 0.5) * colW, panelBot + 2);
        }

        var nMethods = results.length;
        var dotSpread = colW * 0.3;
        var dotStep = nMethods > 1 ? dotSpread / (nMethods - 1) : 0;

        for (var m = 0; m < nMethods; m++) {
            var r = results[m];
            var xOff = -dotSpread / 2 + m * dotStep;

            for (var t = startT; t < nCols; t++) {
                var vals = [];
                for (var k = 0; k < K; k++) vals.push(r.runs[k].anc[t]);
                var sum = 0; for (var k = 0; k < K; k++) sum += vals[k];
                var mean = sum / K;
                var sumSq = 0; for (var k = 0; k < K; k++) sumSq += (vals[k] - mean) * (vals[k] - mean);
                var sd = Math.sqrt(sumSq / K);

                var x = pL + (t + 0.5) * colW + xOff;
                var yMean = panelBot - (mean / maxY) * panelH;
                var yLo = panelBot - (Math.max(0, mean - sd) / maxY) * panelH;
                var yHi = panelBot - (Math.min(maxY, mean + sd) / maxY) * panelH;

                ctx.strokeStyle = r.color;
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(x, yLo); ctx.lineTo(x, yHi);
                ctx.moveTo(x - 2, yLo); ctx.lineTo(x + 2, yLo);
                ctx.moveTo(x - 2, yHi); ctx.lineTo(x + 2, yHi);
                ctx.stroke();

                ctx.fillStyle = r.color;
                ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.arc(x, yMean, 3, 0, 2 * Math.PI); ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.strokeStyle = r.color;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            var first = true;
            for (var t = startT; t < nCols; t++) {
                var sum = 0;
                for (var k = 0; k < K; k++) sum += r.runs[k].anc[t];
                var mean = sum / K;
                var x = pL + (t + 0.5) * colW + xOff;
                var y = panelBot - (mean / maxY) * panelH;
                if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.font = '8px -apple-system, sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (var m = 0; m < results.length; m++) {
            var ly = panelTop + 4 + m * 11;
            ctx.strokeStyle = results[m].color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(pR - 60, ly); ctx.lineTo(pR - 48, ly); ctx.stroke();
            ctx.fillStyle = '#333'; ctx.textAlign = 'left';
            ctx.fillText(results[m].name, pR - 45, ly);
        }
    }

    function triggerRun() { setTimeout(runAllMethods, 0); }
    btnRun.addEventListener('click', triggerRun);
    if (sliderN) sliderN.addEventListener('change', triggerRun);
    if (sliderK) sliderK.addEventListener('change', triggerRun);
    var mainP2 = document.getElementById('select-resid-phase2');
    var toolbarP2 = document.getElementById('smc-toolbar-phase2-select');
    if (mainP2) mainP2.addEventListener('change', triggerRun);
    if (toolbarP2) toolbarP2.addEventListener('change', triggerRun);

    triggerRun();
}

// ================================================================
//  EXPORT
// ================================================================

export function initPFInstances() {
    initDegenViz();
    initCompareViz();
    initKTrials();
}
