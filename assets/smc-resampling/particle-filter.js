// ================================================================
//  SMC Resampling — particle-filter.js
//  Bootstrap particle filter visualization factory.
//  Gaussian random walk model with lineage tracing, ancestry
//  highlighting, and mouseover tooltips.
//  Reads S.PALETTE and S.N from window.SMC.
//
//  Usage:
//    createPFViz({
//      canvasId: 'cv-degeneracy',
//      rerunBtnId: 'btn-degen-rerun',
//      getResampleFn: function() { return null; },  // null = SIS
//      onRun: function(history) { ... },  // optional callback
//      nSteps: 8,
//      model: { sigmaProc: 1, sigmaObs: 0.5, yObs: 2 }
//    });
// ================================================================

function createPFViz(config) {
    'use strict';

    var S = window.SMC;
    if (!S) return null;

    var cv = document.getElementById(config.canvasId);
    if (!cv) return null;

    var nP = S.N;
    var T = config.nSteps || 8;
    var model = config.model || { sigmaProc: 1.0, sigmaObs: 0.5, yObs: 2.0 };
    var sigmaProc = model.sigmaProc;
    var sigmaObs = model.sigmaObs;
    var yObs = model.yObs;

    var selectedLineage = null;
    var history = [];  // [{weights, states, ancestors}]
    var drawLayout = null;
    var hoverInfo = null;  // {t, i} of particle under mouse

    // ================================================================
    //  SEEDABLE PRNG (xorshift128)
    // ================================================================

    var rngState = null;  // null = use Math.random

    function seedRng(seed) {
        // Initialize xorshift128 state from a single integer seed
        seed = seed | 0 || 1;
        rngState = [seed, seed * 2654435761 | 0, seed * 0x01000193 | 0, seed * 2246822519 | 0];
        // Warm up
        for (var i = 0; i < 20; i++) rngNext();
    }

    function rngNext() {
        // xorshift128
        var s = rngState;
        var t = s[3];
        t ^= t << 11; t ^= t >>> 8;
        s[3] = s[2]; s[2] = s[1]; s[1] = s[0];
        t ^= s[0]; t ^= s[0] >>> 19;
        s[0] = t;
        return (t >>> 0) / 4294967296;  // [0, 1)
    }

    function random() {
        return rngState ? rngNext() : Math.random();
    }

    // ================================================================
    //  MODEL
    // ================================================================

    function randn() {
        var u1 = random() || 1e-10, u2 = random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function gaussLogLik(x, mu, sigma) {
        var z = (x - mu) / sigma;
        return -0.5 * z * z;
    }

    // Default multinomial resampling (uses seedable random())
    function resampleMultinomial(weights) {
        var cs = [weights[0]];
        for (var i = 1; i < nP; i++) cs.push(cs[i - 1] + weights[i]);
        cs[nP - 1] = 1.0;
        var ancestors = [];
        for (var k = 0; k < nP; k++) {
            var u = random();
            var j = 0;
            while (j < nP - 1 && u > cs[j]) j++;
            ancestors.push(j);
        }
        return ancestors;
    }

    // ================================================================
    //  SIMULATION
    // ================================================================

    function run(optSeed) {
        // Seed RNG if provided (for reproducible runs)
        var useSeed = false;
        if (optSeed !== undefined) {
            seedRng(optSeed); useSeed = true;
        } else if (config.getSeed) {
            var seed = config.getSeed();
            if (seed !== null) { seedRng(seed); useSeed = true; }
            else rngState = null;
        } else {
            rngState = null;
        }
        // When seeded, also override Math.random so external resamplers are deterministic
        var origMathRandom = Math.random;
        if (useSeed) Math.random = random;
        var resampleFn = config.getResampleFn ? config.getResampleFn() : null;
        history = [];
        selectedLineage = null;
        hoverInfo = null;

        // t=0: sample from prior, reweight by first observation
        var states = [], logW = [];
        for (var i = 0; i < nP; i++) {
            states.push(randn() * sigmaProc);
            logW.push(gaussLogLik(yObs, states[i], sigmaObs));
        }
        var maxLW = Math.max.apply(null, logW);
        var w0 = logW.map(function (lw) { return Math.exp(lw - maxLW); });
        var s0 = w0.reduce(function (a, b) { return a + b; }, 0);
        w0 = w0.map(function (v) { return v / s0; });
        history.push({ weights: w0, states: states.slice(), ancestors: null });

        // t=1..T: Resample → Propagate → Reweight
        for (var t = 1; t <= T; t++) {
            var ancestors = null;
            var curStates = states;

            if (resampleFn) {
                var prevW = history[t - 1].weights;
                ancestors = resampleFn(prevW);
                curStates = ancestors.map(function (a) { return states[a]; });
            }

            var newStates = curStates.map(function (x) {
                return x + randn() * sigmaProc;
            });

            var logW;
            if (resampleFn) {
                logW = newStates.map(function (x) {
                    return gaussLogLik(yObs, x, sigmaObs);
                });
            } else {
                var prevW = history[t - 1].weights;
                logW = prevW.map(function (wi, i) {
                    return Math.log(wi) + gaussLogLik(yObs, newStates[i], sigmaObs);
                });
            }
            var maxLW = Math.max.apply(null, logW);
            var newW = logW.map(function (lw) { return Math.exp(lw - maxLW); });
            var s = newW.reduce(function (a, b) { return a + b; }, 0);
            newW = newW.map(function (v) { return v / s; });

            history.push({
                weights: newW,
                states: newStates.slice(),
                ancestors: ancestors
            });
            states = newStates;
        }
        // Restore Math.random
        if (useSeed) Math.random = origMathRandom;
        draw();
        if (config.onRun) config.onRun(history);
    }

    // ================================================================
    //  LINEAGE TRACING
    // ================================================================

    function computeDisplayPerms() {
        var perms = [];
        var perm0 = [];
        for (var i = 0; i < nP; i++) perm0.push(i);
        perms.push(perm0);
        for (var t = 1; t < history.length; t++) {
            var anc = history[t].ancestors;
            var prevPerm = perms[t - 1];
            var items = [];
            for (var i = 0; i < nP; i++) {
                var parentIdx = anc ? anc[i] : i;
                items.push({ idx: i, ancRow: prevPerm[parentIdx] });
            }
            items.sort(function (a, b) {
                return a.ancRow !== b.ancRow ? a.ancRow - b.ancRow : a.idx - b.idx;
            });
            var perm = new Array(nP);
            for (var row = 0; row < nP; row++) {
                perm[items[row].idx] = row;
            }
            perms.push(perm);
        }
        return perms;
    }

    function traceLineage(clickT, clickI) {
        var lineage = {};
        lineage[clickT + ',' + clickI] = true;
        var idx = clickI;
        for (var t = clickT; t > 0; t--) {
            var anc = history[t].ancestors;
            var parent = anc ? anc[idx] : idx;
            lineage[(t - 1) + ',' + parent] = true;
            idx = parent;
        }
        var current = [clickI];
        for (var t = clickT + 1; t < history.length; t++) {
            var next = [];
            var anc = history[t].ancestors;
            for (var i = 0; i < nP; i++) {
                var parent = anc ? anc[i] : i;
                for (var c = 0; c < current.length; c++) {
                    if (parent === current[c]) {
                        lineage[t + ',' + i] = true;
                        next.push(i);
                        break;
                    }
                }
            }
            current = next;
            if (current.length === 0) break;
        }
        return lineage;
    }

    function traceAllAncestors(clickT) {
        var lineage = {};
        for (var i = 0; i < nP; i++) lineage[clickT + ',' + i] = true;
        for (var i = 0; i < nP; i++) {
            var idx = i;
            for (var t = clickT; t > 0; t--) {
                var anc = history[t].ancestors;
                var parent = anc ? anc[idx] : idx;
                lineage[(t - 1) + ',' + parent] = true;
                idx = parent;
            }
        }
        return lineage;
    }

    // ================================================================
    //  HIT TESTING (shared by click and mousemove)
    // ================================================================

    function hitTest(x, y) {
        if (!drawLayout || history.length === 0) return null;
        var L = drawLayout;
        var t = Math.floor((x - L.pL) / L.colW);
        if (t < 0 || t >= history.length) return null;
        if (y > L.pB) return { type: 'timestep', t: t };
        var displayRow = Math.floor((L.pB - y) / L.rowH);
        if (displayRow < 0 || displayRow >= nP) return null;
        var i = displayRow;
        if (L.perms && L.perms[t]) {
            var perm = L.perms[t];
            for (var pi = 0; pi < nP; pi++) {
                if (perm[pi] === displayRow) { i = pi; break; }
            }
        }
        return { type: 'particle', t: t, i: i };
    }

    // ================================================================
    //  TOOLTIP
    // ================================================================

    var tooltip = document.createElement('div');
    tooltip.className = 'pf-tooltip';
    tooltip.style.cssText = 'display:none; position:fixed; z-index:100; ' +
        'background:rgba(255,255,255,0.95); border:1px solid #ccc; border-radius:4px; ' +
        'padding:4px 7px; font-size:10px; font-family:-apple-system,sans-serif; ' +
        'color:#333; pointer-events:none; box-shadow:0 2px 6px rgba(0,0,0,0.1); ' +
        'line-height:1.4; max-width:180px;';
    document.body.appendChild(tooltip);

    function showTooltip(e, t, i) {
        if (t < 0 || t >= history.length || i < 0 || i >= nP) {
            tooltip.style.display = 'none';
            return;
        }
        var h = history[t];
        var lines = [];
        lines.push('<b>t=' + (t + 1) + ', particle ' + (i + 1) + '</b>');
        lines.push('state: ' + h.states[i].toFixed(3));
        lines.push('weight: ' + h.weights[i].toFixed(4));
        if (h.ancestors && h.ancestors[i] !== undefined) {
            lines.push('ancestor: particle ' + (h.ancestors[i] + 1) + ' at t=' + t);
        }
        // Count children at next step
        if (t < history.length - 1) {
            var nextAnc = history[t + 1].ancestors;
            if (nextAnc) {
                var nChildren = 0;
                for (var c = 0; c < nP; c++) if (nextAnc[c] === i) nChildren++;
                lines.push('children: ' + nChildren);
            }
        }
        tooltip.innerHTML = lines.join('<br>');
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
    }

    // ================================================================
    //  DRAWING
    // ================================================================

    function draw() {
        var dpr = window.devicePixelRatio || 1;
        var W = cv.clientWidth, H = cv.clientHeight;
        if (W === 0 || H === 0) return;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);

        var margin = { top: 10, bottom: 22, left: 22, right: 6 };
        var pL = margin.left, pR = W - margin.right;
        var pT = margin.top, pB = H - margin.bottom;
        var pW = pR - pL, pH = pB - pT;

        var nCols = T + 1;
        var colW = pW / nCols;
        var rowH = pH / nP;
        var barH = rowH * 0.55;
        var maxBarW = colW * 0.8;

        var colors = S.PALETTE;

        var perms = computeDisplayPerms();
        function particleY(t, i) {
            return pB - (perms[t][i] + 0.5) * rowH;
        }

        drawLayout = { pL: pL, pT: pT, pB: pB, colW: colW, rowH: rowH, nCols: nCols, perms: perms };

        // Grid lines
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        for (var t = 0; t < nCols; t++) {
            var gx = pL + (t + 0.5) * colW;
            ctx.beginPath(); ctx.moveTo(gx, pT); ctx.lineTo(gx, pB); ctx.stroke();
        }

        // Global max weight
        var globalMaxW = 0;
        for (var t = 0; t < history.length; t++) {
            var mw = Math.max.apply(null, history[t].weights);
            if (mw > globalMaxW) globalMaxW = mw;
        }

        // Weight bars + arrows
        var hasSelection = selectedLineage !== null;
        for (var t = 0; t < history.length; t++) {
            var h = history[t];
            var cx = pL + (t + 0.5) * colW;

            for (var i = 0; i < nP; i++) {
                var y = particleY(t, i);
                var bw = globalMaxW > 0 ? (h.weights[i] / globalMaxW) * maxBarW : 0;
                var inLineage = hasSelection && selectedLineage[t + ',' + i];
                var dimmed = hasSelection && !inLineage;
                var isHovered = hoverInfo && hoverInfo.t === t && hoverInfo.i === i;

                ctx.fillStyle = colors[i % colors.length];
                ctx.globalAlpha = dimmed ? 0.1 : (inLineage ? 0.7 : 0.45);
                ctx.fillRect(cx - bw, y - barH / 2, bw, barH);
                ctx.strokeStyle = isHovered ? '#333' : colors[i % colors.length];
                ctx.globalAlpha = dimmed ? 0.15 : (inLineage || isHovered ? 1 : 0.7);
                ctx.lineWidth = isHovered ? 1.5 : (inLineage ? 1.2 : 0.7);
                ctx.strokeRect(cx - bw, y - barH / 2, bw, barH);
                ctx.globalAlpha = 1;
            }

            if (t < history.length - 1) {
                var nextH = history[t + 1];
                var nextCx = pL + (t + 1.5) * colW;

                for (var i = 0; i < nP; i++) {
                    var srcIdx = nextH.ancestors ? nextH.ancestors[i] : i;
                    var srcY = particleY(t, srcIdx);
                    var dstY = particleY(t + 1, i);
                    var nextBw = globalMaxW > 0 ? (nextH.weights[i] / globalMaxW) * maxBarW : 0;
                    var arrowInLineage = hasSelection && selectedLineage[t + ',' + srcIdx] && selectedLineage[(t + 1) + ',' + i];
                    var arrowDimmed = hasSelection && !arrowInLineage;
                    var ax1 = cx + 1;
                    var ax2 = nextCx - nextBw - 1;
                    if (ax2 > ax1 + 3) {
                        ctx.strokeStyle = arrowInLineage ? '#555' : '#ccc';
                        ctx.lineWidth = arrowInLineage ? 1.2 : 0.6;
                        ctx.globalAlpha = arrowDimmed ? 0.1 : (arrowInLineage ? 0.8 : 0.5);
                        ctx.beginPath();
                        ctx.moveTo(ax1, srcY);
                        ctx.lineTo(ax2, dstY);
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        // X-axis labels
        var showESS = config.showESS !== false;  // default true
        ctx.font = '7px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#999';
        ctx.fillText('t', pL - 3, pB + 1);
        if (showESS) ctx.fillText('ESS', pL - 3, pB + 10);
        ctx.textAlign = 'center';
        for (var t = 0; t < nCols; t++) {
            var cx = pL + (t + 0.5) * colW;
            ctx.fillStyle = '#999';
            ctx.fillText(t + 1, cx, pB + 1);
            if (showESS && t < history.length) {
                var w = history[t].weights;
                var ess = 1 / w.reduce(function (s, wi) { return s + wi * wi; }, 0);
                ctx.fillStyle = ess < nP * 0.3 ? '#c0392b' : '#999';
                ctx.fillText(ess.toFixed(1), cx, pB + 10);
            }
        }
    }

    // ================================================================
    //  INTERACTION
    // ================================================================

    cv.addEventListener('click', function (e) {
        var rect = cv.getBoundingClientRect();
        var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (!hit) { selectedLineage = null; draw(); return; }

        if (hit.type === 'timestep') {
            if (selectedLineage && selectedLineage._allAncT === hit.t) {
                selectedLineage = null;
            } else {
                selectedLineage = traceAllAncestors(hit.t);
                selectedLineage._allAncT = hit.t;
            }
        } else {
            var key = hit.t + ',' + hit.i;
            if (selectedLineage && selectedLineage[key]) {
                selectedLineage = null;
            } else {
                selectedLineage = traceLineage(hit.t, hit.i);
            }
        }
        draw();
    });

    cv.addEventListener('mousemove', function (e) {
        var rect = cv.getBoundingClientRect();
        var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit && hit.type === 'particle') {
            if (!hoverInfo || hoverInfo.t !== hit.t || hoverInfo.i !== hit.i) {
                hoverInfo = { t: hit.t, i: hit.i };
                draw();
            }
            showTooltip(e, hit.t, hit.i);
            cv.style.cursor = 'pointer';
        } else {
            if (hoverInfo) { hoverInfo = null; draw(); }
            tooltip.style.display = 'none';
            cv.style.cursor = hit ? 'pointer' : 'default';
        }
    });

    cv.addEventListener('mouseleave', function () {
        if (hoverInfo) { hoverInfo = null; draw(); }
        tooltip.style.display = 'none';
    });

    // Re-run button
    var btnRerun = config.rerunBtnId ? document.getElementById(config.rerunBtnId) : null;
    if (btnRerun) btnRerun.addEventListener('click', function () { run(); });

    // Resize
    window.addEventListener('resize', function () { draw(); });

    // Initial run
    run();

    // Return public API
    return { run: run, draw: draw, getHistory: function () { return history; } };
}

// ================================================================
//  INTRO INSTANCE (SIS/SMC toggle in marginnote)
// ================================================================

(function () {
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
                return function (w) { return window.SMC.resample.multinomial(w); };
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
})();

// ================================================================
//  END-OF-POST INSTANCE (method comparison)
// ================================================================

(function () {
    var methodSelect = document.getElementById('select-pf-method');
    var chkSeed = document.getElementById('chk-pf-seed');
    var inputSeed = document.getElementById('input-pf-seed');
    var infoDiv = document.getElementById('pf-compare-info');
    if (!methodSelect) return;

    var S = window.SMC;
    if (!S || !S.resample) return;

    // Show/hide seed input
    if (chkSeed && inputSeed) {
        chkSeed.addEventListener('change', function () {
            inputSeed.style.display = chkSeed.checked ? 'inline' : 'none';
        });
    }

    function getResampleFn() {
        var method = methodSelect.value;
        switch (method) {
            case 'stratified':  return function (w) { return S.resample.stratified(w); };
            case 'systematic':  return function (w) { return S.resample.systematic(w); };
            case 'residual':    return function (w) { return S.resample.residual(w, S.residualPhase2 || 'multinomial'); };
            default:            return function (w) { return S.resample.multinomial(w); };
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
        for (var i = 0; i < S.N; i++) {
            var idx = i;
            for (var t = targetT; t > 0; t--) {
                var anc = history[t].ancestors;
                idx = anc ? anc[idx] : idx;
            }
            ancestors[idx] = true;
        }
        return Object.keys(ancestors).length;
    }

    // Diagnostic plots (single canvas, two rows)
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

        // Unique ancestors only (ESS is shown in the main PF plot)
        var ancValues = [];
        for (var t = 0; t < nT; t++) ancValues.push(countUniqueAncestors(history, t));

        var panelTop = margin.top;
        var panelBot = H - margin.bottom;
        var pH = panelBot - panelTop;
        var color = '#2c3e50';

        // Title
        ctx.fillStyle = color; ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Unique ancestors at t=1 (low \u21d2 path degeneracy)', pL + 2, panelTop - 1);

        // Baseline
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pL, panelBot); ctx.lineTo(pR, panelBot); ctx.stroke();

        // Line + dots (start at t=2, index 1)
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        var first = true;
        for (var t = 1; t < nCols; t++) {
            var x = pL + (t + 0.5) / nCols * pW;
            var y = panelBot - (ancValues[t] / S.N) * pH;
            if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        for (var t = 1; t < nCols; t++) {
            var x = pL + (t + 0.5) / nCols * pW;
            var y = panelBot - (ancValues[t] / S.N) * pH;
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
        showESS: true,  // shown as bottom row in the PF plot
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
        if (opt) opt.textContent = 'Residual-' + (p2Short[S.residualPhase2] || 'Multi');
    }
    updateResidualLabel();
    var mainP2 = document.getElementById('select-resid-phase2');
    if (mainP2) mainP2.addEventListener('change', function () { updateResidualLabel(); });
    var toolbarP2 = document.getElementById('smc-toolbar-phase2-select');
    if (toolbarP2) toolbarP2.addEventListener('change', function () { updateResidualLabel(); });
})();

// ================================================================
//  K-TRIALS COMPARISON (all methods, overlaid diagnostics)
// ================================================================

(function () {
    'use strict';

    var S = window.SMC;
    if (!S || !S.resample) return;

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

    // Run one PF, return {essPerStep, uniqueAncPerStep}
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
            var logW = newStates.map(function (x) { return gaussLogLik(yObs, x, sigmaObs); });
            var maxLW = Math.max.apply(null, logW);
            var newW = logW.map(function (lw) { return Math.exp(lw - maxLW); });
            var s = newW.reduce(function (a, b) { return a + b; }, 0);
            newW = newW.map(function (v) { return v / s; });
            history.push({ weights: newW, ancestors: ancestors });
            states = newStates;
            w = newW;
        }

        // Compute diagnostics
        var essPerStep = [], ancPerStep = [];
        for (var t = 0; t <= T; t++) {
            var wt = history[t].weights;
            essPerStep.push(1 / wt.reduce(function (s, wi) { return s + wi * wi; }, 0));
            // Unique ancestors at t=0
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
            { name: 'Multinomial', color: S.METHOD_COLORS.multinomial, fn: function (w) { return S.resample.multinomial(w); } },
            { name: 'Stratified', color: S.METHOD_COLORS.stratified, fn: function (w) { return S.resample.stratified(w); } },
            { name: 'Systematic', color: S.METHOD_COLORS.systematic, fn: function (w) { return S.resample.systematic(w); } },
            { name: 'Resid-' + ({multinomial:'Multi',stratified:'Strat',systematic:'Syst'}[S.residualPhase2] || 'Multi'),
              color: S.METHOD_COLORS.residual, fn: function (w) { return S.resample.residual(w, S.residualPhase2 || 'multinomial'); } },
        ];

        // Run K trials per method
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

        // Only show path degeneracy — ESS is similar across methods since
        // resampling resets weights; the methods only differ in which particles survive.
        // Compute actual max across all data for dynamic y-axis
        var dataMax = 0;
        for (var m = 0; m < results.length; m++) {
            for (var k = 0; k < K; k++) {
                for (var t = 1; t < nCols; t++) {  // start at t=1 (startT)
                    var v = results[m].runs[k].anc[t];
                    if (v > dataMax) dataMax = v;
                }
            }
        }
        // maxY: at least N/2, at most N, scaled to show data
        var maxY = Math.max(nP / 2, Math.min(nP, dataMax * 1.1));

        var colW = pW / nCols;
        var panelTop = margin.top;
        var panelBot = H - margin.bottom;
        var panelH = panelBot - panelTop;
        var startT = 1;  // ancestors start at t=2

        // Title
        ctx.fillStyle = '#666'; ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Unique ancestors at t=1, as proportion of N (low \u21d2 path degeneracy)', pL + 2, panelTop - 1);

        // Axes
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pL, panelBot); ctx.lineTo(pR, panelBot); ctx.stroke();

        // Y reference lines as proportions
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

        // Y labels (proportions)
        ctx.fillStyle = '#bbb'; ctx.font = '7px -apple-system, sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (var yi = 0; yi < yTicks.length; yi++) {
            var propVal = yTicks[yi] * nP;
            if (propVal > maxY) continue;
            var yy = panelBot - (propVal / maxY) * panelH;
            ctx.fillText((yTicks[yi] * 100).toFixed(0) + '%', pL - 2, yy);
        }
        ctx.fillText('0%', pL - 2, panelBot);

        // X labels
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#999';
        for (var t = 0; t < nCols; t++) {
            ctx.fillText(t + 1, pL + (t + 0.5) * colW, panelBot + 2);
        }

        // Mean dots + SD bars for each method (offset horizontally to avoid overlap)
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

                // SD bar
                ctx.strokeStyle = r.color;
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(x, yLo); ctx.lineTo(x, yHi);
                ctx.moveTo(x - 2, yLo); ctx.lineTo(x + 2, yLo);
                ctx.moveTo(x - 2, yHi); ctx.lineTo(x + 2, yHi);
                ctx.stroke();

                // Mean dot
                ctx.fillStyle = r.color;
                ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.arc(x, yMean, 3, 0, 2 * Math.PI); ctx.fill();
                ctx.globalAlpha = 1;
            }

            // Connect means with a line
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

        // Legend (top-right)
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
    // Re-run when residual phase-2 changes (affects the residual method's results)
    var mainP2 = document.getElementById('select-resid-phase2');
    var toolbarP2 = document.getElementById('smc-toolbar-phase2-select');
    if (mainP2) mainP2.addEventListener('change', triggerRun);
    if (toolbarP2) toolbarP2.addEventListener('change', triggerRun);

    // Auto-run on page load
    triggerRun();
})();
