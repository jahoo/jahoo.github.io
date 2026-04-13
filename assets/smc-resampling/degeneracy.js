// ================================================================
//  SMC Resampling — degeneracy.js
//  Weight degeneracy / path degeneracy illustration.
//  Bootstrap particle filter on a Gaussian random walk model.
//  Self-contained: reads S.PALETTE and S.N from window.SMC.
// ================================================================

(function () {
    'use strict';

    var S = window.SMC;
    if (!S) return;

    var cv = document.getElementById('cv-degeneracy');
    var btnRerun = document.getElementById('btn-degen-rerun');
    var chkResample = document.getElementById('chk-degen-resample');
    var infoSpan = document.getElementById('degen-info');
    var captionSpan = document.getElementById('degen-caption');
    if (!cv || !btnRerun) return;

    var nP = S.N;
    var T = 8;
    var selectedLineage = null;  // Set of "t,i" strings that are highlighted
    var sigmaProc = 1.0;
    var sigmaObs = 0.5;
    var yObs = 2.0;
    var history = [];  // [{weights, states, ancestors}]

    // ================================================================
    //  MODEL: Gaussian random walk with Gaussian observations
    // ================================================================

    function randn() {
        var u1 = Math.random(), u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function gaussLogLik(x, mu, sigma) {
        var z = (x - mu) / sigma;
        return -0.5 * z * z;
    }

    // Multinomial resampling: returns ancestor indices
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
        var doResample = chkResample && chkResample.checked;
        history = [];

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

        // t=1..T: Resample (if SMC) → Propagate → Reweight
        for (var t = 1; t <= T; t++) {
            var ancestors = null;
            var curStates = states;

            if (doResample) {
                var prevW = history[t - 1].weights;
                ancestors = resampleMultinomial(prevW);
                curStates = ancestors.map(function (a) { return states[a]; });
            }

            // Propagate
            var newStates = curStates.map(function (x) {
                return x + randn() * sigmaProc;
            });

            // Reweight
            var logW;
            if (doResample) {
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
        updateInfo();
        updateCaption();
    }

    function updateInfo() {
        if (infoSpan) infoSpan.textContent = '';
    }

    function updateCaption() {
        var doResample = chkResample && chkResample.checked;
        var sisLabel = document.getElementById('degen-label-sis');
        var smcLabel = document.getElementById('degen-label-smc');
        if (sisLabel) sisLabel.className = 'degen-toggle-label' + (doResample ? '' : ' active');
        if (smcLabel) smcLabel.className = 'degen-toggle-label' + (doResample ? ' active' : '');
        if (!captionSpan) return;
        if (doResample) {
            captionSpan.textContent = 'With resampling (SMC): weights remain diverse across steps.';
        } else {
            captionSpan.textContent = 'Without resampling (SIS): weights often become degenerate.';
        }
    }

    // ================================================================
    //  LINEAGE TRACING
    // ================================================================

    // Display permutations: sort particles by ancestor's display row
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

    // Trace ancestors + descendants from a single particle
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

    // Trace ancestors of ALL particles at a timestep (backward only)
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
    //  DRAWING
    // ================================================================

    var drawLayout = null;

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

        // Display permutations (always untangle)
        var perms = computeDisplayPerms();
        function particleY(t, i) {
            var row = perms[t][i];
            return pB - (row + 0.5) * rowH;
        }

        drawLayout = { pL: pL, pT: pT, pB: pB, colW: colW, rowH: rowH, nCols: nCols, perms: perms };

        // Grid lines
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        for (var t = 0; t < nCols; t++) {
            var gx = pL + (t + 0.5) * colW;
            ctx.beginPath(); ctx.moveTo(gx, pT); ctx.lineTo(gx, pB); ctx.stroke();
        }

        // Global max weight (absolute scale)
        var globalMaxW = 0;
        for (var t = 0; t < history.length; t++) {
            var mw = Math.max.apply(null, history[t].weights);
            if (mw > globalMaxW) globalMaxW = mw;
        }

        // Weight bars + ancestor arrows
        var hasSelection = selectedLineage !== null;
        for (var t = 0; t < history.length; t++) {
            var h = history[t];
            var cx = pL + (t + 0.5) * colW;

            for (var i = 0; i < nP; i++) {
                var y = particleY(t, i);
                var bw = globalMaxW > 0 ? (h.weights[i] / globalMaxW) * maxBarW : 0;
                var inLineage = hasSelection && selectedLineage[t + ',' + i];
                var dimmed = hasSelection && !inLineage;

                ctx.fillStyle = colors[i % colors.length];
                ctx.globalAlpha = dimmed ? 0.1 : (inLineage ? 0.7 : 0.45);
                ctx.fillRect(cx - bw, y - barH / 2, bw, barH);
                ctx.strokeStyle = colors[i % colors.length];
                ctx.globalAlpha = dimmed ? 0.15 : (inLineage ? 1 : 0.7);
                ctx.lineWidth = inLineage ? 1.2 : 0.7;
                ctx.strokeRect(cx - bw, y - barH / 2, bw, barH);
                ctx.globalAlpha = 1;
            }

            // Arrows to next step
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

        // Row labels on the left
        ctx.font = '7px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#999';
        ctx.fillText('t', pL - 3, pB + 1);
        ctx.fillText('ESS', pL - 3, pB + 10);
        // Per-step values
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
        if (!drawLayout || history.length === 0) return;
        var rect = cv.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var L = drawLayout;
        var t = Math.floor((x - L.pL) / L.colW);
        if (t < 0 || t >= history.length) { selectedLineage = null; draw(); return; }

        // Click on timestep label area (below plot)?
        if (y > L.pB) {
            if (selectedLineage && selectedLineage._allAncT === t) {
                selectedLineage = null;
            } else {
                selectedLineage = traceAllAncestors(t);
                selectedLineage._allAncT = t;
            }
            draw();
            return;
        }

        // Click on particle bar
        var displayRow = Math.floor((L.pB - y) / L.rowH);
        if (displayRow < 0 || displayRow >= nP) { selectedLineage = null; draw(); return; }
        var i = displayRow;
        if (L.perms && L.perms[t]) {
            var perm = L.perms[t];
            for (var pi = 0; pi < nP; pi++) {
                if (perm[pi] === displayRow) { i = pi; break; }
            }
        }
        var key = t + ',' + i;
        if (selectedLineage && selectedLineage[key]) {
            selectedLineage = null;
        } else {
            selectedLineage = traceLineage(t, i);
        }
        draw();
    });
    cv.style.cursor = 'pointer';

    btnRerun.addEventListener('click', function () { selectedLineage = null; run(); });
    if (chkResample) chkResample.addEventListener('change', function () { selectedLineage = null; run(); });

    // Initial run
    run();
    window.addEventListener('resize', function () { draw(); });
    // Redraw when marginnote toggle reveals the canvas (narrow mode)
    var toggle = document.getElementById('mn-degen');
    if (toggle) toggle.addEventListener('change', function () {
        setTimeout(draw, 50);
    });

})();
