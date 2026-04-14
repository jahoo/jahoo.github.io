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
    //  MODEL
    // ================================================================

    function randn() {
        var u1 = Math.random(), u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function gaussLogLik(x, mu, sigma) {
        var z = (x - mu) / sigma;
        return -0.5 * z * z;
    }

    // Default multinomial resampling (used if no external fn provided)
    function resampleMultinomial(weights) {
        var cs = [weights[0]];
        for (var i = 1; i < nP; i++) cs.push(cs[i - 1] + weights[i]);
        cs[nP - 1] = 1.0;
        var ancestors = [];
        for (var k = 0; k < nP; k++) {
            var u = Math.random();
            var j = 0;
            while (j < nP - 1 && u > cs[j]) j++;
            ancestors.push(j);
        }
        return ancestors;
    }

    // ================================================================
    //  SIMULATION
    // ================================================================

    function run() {
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

        // X-axis labels + ESS
        ctx.font = '7px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#999';
        ctx.fillText('t', pL - 3, pB + 1);
        ctx.fillText('ESS', pL - 3, pB + 10);
        ctx.textAlign = 'center';
        for (var t = 0; t < nCols; t++) {
            var cx = pL + (t + 0.5) * colW;
            ctx.fillStyle = '#999';
            ctx.fillText(t + 1, cx, pB + 1);
            if (t < history.length) {
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
