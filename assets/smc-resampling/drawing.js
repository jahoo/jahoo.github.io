// ================================================================
//  SMC Resampling — drawing.js
//  All canvas drawing functions.
//  Reads config/state from window.SMC namespace.
// ================================================================

'use strict';

(function () {

    var S = window.SMC;

    // ================================================================
    //  PANEL LAYOUT — computes shared coordinates for the back-to-back view
    // ================================================================

    function panelLayout(w, h) {
        var N = S.N;
        var margin = { top: 22, bottom: 36, left: 10, right: 10 };
        var plotT = margin.top;
        var plotB = h - margin.bottom;
        var plotH = plotB - plotT;
        var rowH = plotH / N;
        var barH = rowH * 0.65;

        // Horizontal zones
        var histFrac = 0.28;   // fraction for histogram
        var gapW = 32;         // gap for y-axis labels
        var totalW = w - margin.left - margin.right;
        var histW = totalW * histFrac;
        var cdfW = totalW - histW - gapW;

        var histL = margin.left;                    // left edge of hist area
        var histR = margin.left + histW;            // right edge of hist bars
        var gapL = histR;
        var gapC = histR + gapW / 2;               // center of label gap
        var cdfL = histR + gapW;                    // left edge of CDF area
        var cdfR = w - margin.right;                // right edge of CDF area

        function idxToY(i) { return plotB - (i + 0.5) * rowH; }
        function uToX(u) { return cdfL + u * cdfW; }
        function xToU(x) { return Math.max(0, Math.min(1, (x - cdfL) / cdfW)); }
        // Histogram: value -> x (bars grow LEFT from histR)
        function valToHistX(v, maxVal) { return histR - (v / maxVal) * histW; }

        return {
            w: w, h: h, margin: margin, plotT: plotT, plotB: plotB, plotH: plotH, rowH: rowH, barH: barH,
            histL: histL, histR: histR, histW: histW, gapL: gapL, gapC: gapC, gapW: gapW, cdfL: cdfL, cdfR: cdfR, cdfW: cdfW,
            idxToY: idxToY, uToX: uToX, xToU: xToU, valToHistX: valToHistX,
        };
    }

    // ================================================================
    //  DRAW: SHARED Y-AXIS LABELS
    // ================================================================

    function drawYAxis(ctx, L) {
        var N = S.N;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var i = 0; i < N; i++) {
            ctx.fillStyle = S.PALETTE[i];
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText(i + 1, L.gapC, L.idxToY(i));
        }
    }

    // ================================================================
    //  DRAW: LEFT HISTOGRAM (right-justified, bars grow leftward)
    // ================================================================

    /** Format a number: integers as-is, floats to at most 4 significant figures. */
    function fmtNum(v) {
        if (v % 1 === 0) return v.toString();
        return Number(v.toPrecision(4)).toString();
    }

    function drawLeftHistogram(ctx, L, values, opts) {
        var N = S.N;
        opts = opts || {};
        if (!values) return;
        var maxVal = opts.maxVal || Math.max.apply(null, values.concat([0.01]));
        if (opts.probeCountOverlay && opts.probeCountTotal > 0) {
            var maxProportion = Math.max.apply(null, opts.probeCountOverlay) / opts.probeCountTotal;
            maxVal = Math.max(maxVal, maxProportion * 1.05);
        }
        if (opts.expected) maxVal = Math.max.apply(null, [maxVal].concat(opts.expected));

        for (var i = 0; i < N; i++) {
            var y = L.idxToY(i);
            var barW = (values[i] / maxVal) * L.histW;
            var x = L.histR - barW;

            // Main bar
            ctx.fillStyle = S.PALETTE[i];
            ctx.globalAlpha = 0.5;
            ctx.fillRect(x, y - L.barH / 2, barW, L.barH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = S.PALETTE[i];
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y - L.barH / 2, barW, L.barH);

            // Drag handle
            ctx.strokeStyle = S.PALETTE[i];
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - L.barH / 2);
            ctx.lineTo(x, y + L.barH / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Overlay (e.g., deterministic portion for residual)
            if (opts.overlayValues) {
                var oW = (opts.overlayValues[i] / maxVal) * L.histW;
                ctx.fillStyle = S.PALETTE[i];
                ctx.globalAlpha = 0.9;
                ctx.fillRect(L.histR - oW, y - L.barH / 2, oW, L.barH);
                ctx.globalAlpha = 1;
            }

            // Error bars
            if (opts.errors && opts.errors[i]) {
                var errInfo = opts.errors[i];
                var xHi = L.histR - (errInfo.hi / maxVal) * L.histW;
                var xLo = L.histR - (Math.max(0, errInfo.lo) / maxVal) * L.histW;
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(xHi, y); ctx.lineTo(xLo, y);
                ctx.moveTo(xHi, y - 3); ctx.lineTo(xHi, y + 3);
                ctx.moveTo(xLo, y - 3); ctx.lineTo(xLo, y + 3);
                ctx.stroke();
            }

            // Expected value marker (dashed vertical tick)
            if (opts.expected) {
                var ex = L.histR - (opts.expected[i] / maxVal) * L.histW;
                ctx.strokeStyle = '#c0392b';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([3, 2]);
                ctx.beginPath();
                ctx.moveTo(ex, y - L.barH / 2 - 2);
                ctx.lineTo(ex, y + L.barH / 2 + 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Weight value label
            ctx.fillStyle = '#333';
            ctx.globalAlpha = 0.5;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            var label = fmtNum(values[i]);
            ctx.fillText(label, x - 3, y + 8);
            ctx.globalAlpha = 1;
        }

        // 1/N grid lines on histogram (residual section only)
        // These show the integer thresholds: any weight bar crossing
        // a grid line gets a guaranteed deterministic copy.
        if (opts.detCopies) {
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([4, 3]);
            // Draw lines at k/N for k = 1, 2, ... up to the visible range
            var maxK = Math.ceil(maxVal * N);
            for (var k = 1; k <= maxK; k++) {
                var gx = L.histR - (k / N / maxVal) * L.histW;
                if (gx < L.histL) break;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(gx, L.plotT);
                ctx.lineTo(gx, L.plotB);
                ctx.stroke();
                // Label every visible grid line
                ctx.globalAlpha = 0.35;
                ctx.fillStyle = '#666';
                ctx.font = '8px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(k + '/' + N, gx, L.plotB + 2);
            }
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }

        // Deterministic + stochastic stacked bars (residual)
        if (opts.detCopies) {
            var extraH = 3;
            var stoCounts = (opts.probeCountOverlay && opts.probeCountTotal > 0)
                ? opts.probeCountOverlay.map(function (tot, i) { return Math.max(0, tot - opts.detCopies[i]); })
                : null;

            for (var i = 0; i < N; i++) {
                var y = L.idxToY(i);
                var detW = (opts.detCopies[i] / N / maxVal) * L.histW;
                var stoW = stoCounts ? (stoCounts[i] / N / maxVal) * L.histW : 0;

                // Deterministic segment
                if (detW > 0) {
                    var mc = opts.methodColor;
                    var xDet = L.histR - detW;
                    ctx.fillStyle = mc;
                    ctx.globalAlpha = 0.12;
                    ctx.fillRect(xDet, y - L.barH / 2 - extraH, detW, L.barH + 2 * extraH);
                    ctx.strokeStyle = mc;
                    ctx.globalAlpha = 0.7;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(xDet, y - L.barH / 2 - extraH, detW, L.barH + 2 * extraH);
                    ctx.globalAlpha = 1;
                }

                // Stochastic segment
                if (stoW > 0) {
                    var mc = opts.methodColor;
                    var xDetEnd = L.histR - detW;
                    var xSto = xDetEnd - stoW;
                    ctx.fillStyle = mc;
                    ctx.globalAlpha = 0.12;
                    ctx.fillRect(xSto, y - L.barH / 2 - extraH, stoW, L.barH + 2 * extraH);
                    ctx.strokeStyle = mc;
                    ctx.globalAlpha = 0.6;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([3, 2]);
                    ctx.strokeRect(xSto, y - L.barH / 2 - extraH, stoW, L.barH + 2 * extraH);
                    ctx.setLineDash([]);

                    var totalCount = opts.detCopies[i] + stoCounts[i];
                    ctx.fillStyle = mc;
                    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(fmtNum(totalCount / N), xSto - 3, y - 6);
                    ctx.globalAlpha = 1;
                }
            }

            // Annotation below the plot area
            var detTotal = 0;
            for (var i = 0; i < N; i++) detTotal += opts.detCopies[i];
            var R = N - detTotal;
            ctx.fillStyle = '#777';
            ctx.globalAlpha = 0.7;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            var detLabel = opts.detLabel || (detTotal + ' deterministic;  R = ' + R + ' residual');
            ctx.fillText(detLabel, L.histL + 2, L.plotB + 14);
            ctx.globalAlpha = 1;
        }

        // Probe count overlay: dashed hollow bars (for non-residual sections)
        if (!opts.detCopies && opts.probeCountOverlay && opts.probeCountTotal > 0) {
            var total = opts.probeCountTotal;
            var extraH = 4;
            for (var i = 0; i < N; i++) {
                var proportion = opts.probeCountOverlay[i] / total;
                if (proportion <= 0) continue;
                var barW = (proportion / maxVal) * L.histW;
                var x = L.histR - barW;
                var y = L.idxToY(i);

                var mc = opts.methodColor;
                ctx.fillStyle = mc;
                ctx.globalAlpha = 0.12;
                ctx.fillRect(x, y - L.barH / 2 - extraH, barW, L.barH + 2 * extraH);
                ctx.strokeStyle = mc;
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 2]);
                ctx.strokeRect(x, y - L.barH / 2 - extraH, barW, L.barH + 2 * extraH);
                ctx.setLineDash([]);

                ctx.fillStyle = mc;
                ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(fmtNum(opts.probeCountOverlay[i] / total), x - 3, y - 6);
                ctx.globalAlpha = 1;
            }
        }

        // Histogram baseline (right edge)
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.histR, L.plotT);
        ctx.lineTo(L.histR, L.plotB);
        ctx.stroke();

        // Store the actual maxVal used for rendering so drag handler matches
        L.histMaxVal = maxVal;
    }

    // ================================================================
    //  DRAW: RIGHT CDF / QUANTILE PLOT
    // ================================================================

    function drawRightCDF(ctx, L, probeList, probeColor, opts) {
        var N = S.N;
        opts = opts || {};
        var activeWeights = opts.residualWeights || S.weights;
        var cs = S.cumulativeSum(activeWeights);


        // Strata bands (on top of row shading, semi-transparent)
        if (opts.strata) {
            var bandColor = opts.strataColor || 'rgba(41,128,185,';  // default: stratified blue
            var nStrata = opts.strataCount || N;  // R for residual, N otherwise
            for (var k = 0; k < nStrata; k++) {
                ctx.fillStyle = k % 2 === 0 ? bandColor + '0.06)' : bandColor + '0.0)';
                ctx.fillRect(L.uToX(k / nStrata), L.plotT, L.cdfW / nStrata, L.plotH);
            }
            for (var k = 0; k <= nStrata; k++) {
                ctx.strokeStyle = bandColor + '0.18)';
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(L.uToX(k / nStrata), L.plotT);
                ctx.lineTo(L.uToX(k / nStrata), L.plotB);
                ctx.stroke();
            }
        }

        // Ghost CDF (for residual)
        if (opts.ghostCDF) {
            var gcs = S.cumulativeSum(opts.ghostCDF.weights);
            drawStaircase(ctx, L, gcs, '#aaa', 1, [4, 3], 0.4);
        }

        // CDF bars at each index row
        for (var i = 0; i < N; i++) {
            var uL = i === 0 ? 0 : cs[i - 1];
            var uR = cs[i];
            var xL = L.uToX(uL), xR = L.uToX(uR);
            var yC = L.idxToY(i);
            ctx.fillStyle = S.PALETTE[i];
            ctx.globalAlpha = 0.5;
            ctx.fillRect(xL, yC - L.barH / 2, xR - xL, L.barH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = S.PALETTE[i];
            ctx.lineWidth = 1;
            ctx.strokeRect(xL, yC - L.barH / 2, xR - xL, L.barH);
        }

        // Staircase outline
        drawStaircase(ctx, L, cs, '#555', 1.2, [], 1);

        // Axes
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.cdfL, L.plotB); ctx.lineTo(L.cdfR, L.plotB);
        ctx.moveTo(L.cdfL, L.plotT); ctx.lineTo(L.cdfL, L.plotB);
        ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var ticks = [0, 0.25, 0.5, 0.75, 1.0];
        for (var ti = 0; ti < ticks.length; ti++) {
            var u = ticks[ti];
            ctx.fillText(u.toFixed(u === 0 || u === 1 ? 0 : 2), L.uToX(u), L.plotB + 4);
            ctx.beginPath(); ctx.moveTo(L.uToX(u), L.plotB); ctx.lineTo(L.uToX(u), L.plotB + 3);
            ctx.strokeStyle = '#999'; ctx.stroke();
        }
        ctx.fillStyle = '#888';
        ctx.font = 'italic 10px -apple-system, BlinkMacSystemFont, serif';
        ctx.fillText('x', L.cdfL + L.cdfW / 2, L.plotB + 18);

        // Hover ghost probe
        if (opts.hoverU != null) {
            drawProbe(ctx, L, cs, opts.hoverU, probeColor || '#333', 0.3);
        }

        // Probes
        if (probeList) {
            for (var pi = 0; pi < probeList.length; pi++) {
                drawProbe(ctx, L, cs, probeList[pi].u, probeColor || '#333', 1.0);
            }
        }

        // Comb spine
        if (opts.comb && probeList && probeList.length > 1) {
            ctx.strokeStyle = probeColor || '#333';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(L.uToX(probeList[0].u), L.plotB + 4);
            ctx.lineTo(L.uToX(probeList[probeList.length - 1].u), L.plotB + 4);
            ctx.stroke();
            ctx.globalAlpha = 1;
            // Handle circle on first probe
            var hx = L.uToX(probeList[0].u);
            ctx.fillStyle = probeColor || '#333';
            ctx.beginPath(); ctx.arc(hx, L.plotB + 4, 6, 0, 2 * Math.PI); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
    }

    function drawStaircase(ctx, L, cs, color, lineWidth, dash, alpha) {
        var N = S.N;
        var isGhost = dash && dash.length > 0;
        var showCircles = !isGhost && lineWidth >= 1;
        var r = 3.2;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash || []);
        ctx.globalAlpha = alpha != null ? alpha : 1;

        ctx.beginPath();
        for (var i = 0; i < N; i++) {
            var uL = i === 0 ? 0 : cs[i - 1];
            var uR = cs[i];
            var yC = L.idxToY(i);
            var xL = L.uToX(uL);
            var xR = L.uToX(uR);

            var gapPx = showCircles ? r : 0;
            ctx.moveTo(xL + gapPx, yC);
            ctx.lineTo(xR, yC);

            if (i < N - 1) {
                var yNext = L.idxToY(i + 1);
                ctx.moveTo(xR, yC);
                ctx.lineTo(xR, showCircles ? yNext + r : yNext);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Open/closed boundary circles
        if (showCircles) {
            for (var i = 0; i < N; i++) {
                var uL = i === 0 ? 0 : cs[i - 1];
                var uR = cs[i];
                var yC = L.idxToY(i);
                var xL = L.uToX(uL);
                var xR = L.uToX(uR);

                // Open circle at left end
                ctx.beginPath();
                ctx.arc(xL, yC, r, 0, 2 * Math.PI);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Filled circle at right end
                ctx.beginPath();
                ctx.arc(xR, yC, r, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }

    function drawProbe(ctx, L, cs, u, color, alpha) {
        var idx = S.searchSorted(cs, u);
        var x = L.uToX(u);
        var yTarget = L.idxToY(idx);
        ctx.globalAlpha = alpha;

        // Vertical dashed line
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, L.plotB); ctx.lineTo(x, yTarget); ctx.stroke();
        ctx.setLineDash([]);

        // Triangle on x-axis
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, L.plotB); ctx.lineTo(x - 3.5, L.plotB + 7); ctx.lineTo(x + 3.5, L.plotB + 7);
        ctx.closePath(); ctx.fill();

        // Circle at intersection
        ctx.fillStyle = S.PALETTE[idx];
        ctx.beginPath(); ctx.arc(x, yTarget, 3.5, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.stroke();

        ctx.globalAlpha = 1;
    }

    // ================================================================
    //  DRAW: FULL PANEL (histogram | y-axis | CDF)
    // ================================================================

    function drawPanel(canvas, opts) {
        var result = S.resetCanvas(canvas);
        var ctx = result.ctx, w = result.w, h = result.h;
        var L = panelLayout(w, h);

        // White background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Draw the three zones
        drawLeftHistogram(ctx, L, opts.histValues, {
            maxVal: opts.histMax,
            expected: opts.histExpected,
            errors: opts.histErrors,
            overlayValues: opts.histOverlay,
            probeCountOverlay: opts.probeCountOverlay,
            probeCountTotal: opts.probeCountTotal,
            detCopies: opts.detCopies,
            methodColor: opts.probeColor || '#555',
        });

        drawRightCDF(ctx, L, opts.probes, opts.probeColor, {
            strata: opts.strata,
            strataColor: opts.strataColor,
            strataCount: opts.strataCount,
            comb: opts.comb,
            hoverU: opts.hoverU,
            ghostCDF: opts.ghostCDF,
            residualWeights: opts.residualWeights,
        });

        drawYAxis(ctx, L);

        // Store layout for interaction hit-testing
        canvas._L = L;
    }

    // ================================================================
    //  DRAW: METHOD SECTION (sections 3-5)
    // ================================================================

    function drawMethodSection(canvas, sec, probeColor, opts) {
        var N = S.N;
        var weights = S.weights;
        var cs = S.cumulativeSum(weights); cs[N - 1] = 1.0;

        var histValues = weights.slice();
        var histMax = Math.max.apply(null, weights) * 1.15;
        var overlay = {};

        if (sec.mode === 'single' && sec.probes && sec.probes.length > 0) {
            // Recompute counts from probes through CURRENT CDF (live update on weight drag)
            var liveCounts = S.countIndices(
                sec.probes.map(function (p) { return S.searchSorted(cs, p.u); }), N
            );
            overlay.probeCountOverlay = liveCounts;
            overlay.probeCountTotal = N;
        }
        if (sec.mode === 'ktrials' && sec.hist) {
            overlay.probeCountOverlay = sec.hist.means;
            overlay.probeCountTotal = N;
            overlay.errors = sec.hist.means.map(function (m, i) {
                return {
                    lo: (m - sec.hist.stds[i]) / N,
                    hi: (m + sec.hist.stds[i]) / N,
                };
            });
        }

        var panelOpts = {
            histValues: histValues, histMax: histMax,
            probes: sec.probes,
            probeColor: probeColor,
            strata: opts && opts.strata,
            strataColor: opts && opts.strataColor,
            comb: opts && opts.comb,
            hoverU: null,
        };
        // Merge overlay
        for (var key in overlay) panelOpts[key] = overlay[key];

        drawPanel(canvas, panelOpts);
    }

    // ================================================================
    //  DRAW: RESIDUAL SECTION (section 6)
    // ================================================================

    function drawResidualSection() {
        var N = S.N;
        var weights = S.weights;
        var sec6 = S.sec6;
        var cvSec6 = document.getElementById('cv-sec6');

        var histValues = weights.slice();
        var histMax = Math.max.apply(null, weights) * 1.15;
        var overlay = {};

        // Deterministic copies
        var detCopies = weights.map(function (wi) { return Math.floor(N * wi); });
        overlay.detCopies = detCopies;

        if (sec6.mode === 'single' && sec6.residualProbes && sec6.residualProbes.length > 0) {
            // Recompute stochastic counts from probes through current residual CDF
            var res2 = weights.map(function (wi, i) { return wi - detCopies[i] / N; });
            var resSum2 = res2.reduce(function (a, b) { return a + b; }, 0);
            var normRes2 = resSum2 > 0 ? res2.map(function (r) { return r / resSum2; }) : weights.slice();
            var resCs = S.cumulativeSum(normRes2); resCs[N - 1] = 1.0;
            var stoCounts = S.countIndices(
                sec6.residualProbes.map(function (p) { return S.searchSorted(resCs, p.u); }), N
            );
            var totalCounts = detCopies.map(function (d, i) { return d + stoCounts[i]; });
            overlay.probeCountOverlay = totalCounts;
            overlay.probeCountTotal = N;
        }
        if (sec6.mode === 'ktrials' && sec6.hist) {
            overlay.probeCountOverlay = sec6.hist.means;
            overlay.probeCountTotal = N;
        }

        // Compute residual weights for the CDF display
        var res = weights.map(function (wi, i) { return wi - detCopies[i] / N; });
        var resSum = res.reduce(function (a, b) { return a + b; }, 0);
        var normRes = resSum > 0 ? res.map(function (r) { return r / resSum; }) : weights.slice();

        // Phase-2 strata bands for stratified/systematic
        var R = N - detCopies.reduce(function (a, b) { return a + b; }, 0);
        var phase2 = S.residualPhase2;
        var showStrata = (phase2 === 'stratified' || phase2 === 'systematic') && R > 0;

        var panelOpts = {
            histValues: histValues, histMax: histMax,
            probes: sec6.residualProbes,
            probeColor: S.METHOD_COLORS.residual,
            ghostCDF: { weights: weights.slice() },
            residualWeights: normRes,
            strata: showStrata,
            strataColor: 'rgba(142,68,173,',  // residual purple
            strataCount: R,  // number of strata (R, not N)
            comb: phase2 === 'systematic' && R > 0,
        };
        for (var key in overlay) panelOpts[key] = overlay[key];

        drawPanel(cvSec6, panelOpts);
    }

    // ================================================================
    //  DRAW: BRANCH-KILL SECTION
    // ================================================================

    function drawBranchKillSection() {
        var cvBK = document.getElementById('cv-bk');
        if (!cvBK) return;
        var N = S.N;
        var weights = S.weights;
        var secBK = S.secBK;

        var result = S.resetCanvas(cvBK);
        var ctx = result.ctx, w = result.w, h = result.h;
        var L = panelLayout(w, h);

        // White background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Deterministic copies for histogram grid lines
        var detCopies = weights.map(function (wi) { return Math.floor(N * wi); });

        // --- Left histogram ---
        var histValues = weights.slice();
        var histMax = Math.max.apply(null, weights) * 1.15;
        var detTotal = detCopies.reduce(function (a, b) { return a + b; }, 0);
        var histOpts = { maxVal: histMax, detCopies: detCopies, methodColor: S.METHOD_COLORS.branchkill };

        if (secBK.mode === 'single' && secBK.bonusProbes) {
            // Recompute hit/miss through CURRENT weights (live update on drag)
            for (var i = 0; i < N; i++) {
                var livePi = N * weights[i] - detCopies[i];
                secBK.bonusProbes[i].p = livePi;
                secBK.bonusProbes[i].hit = secBK.bonusProbes[i].u >= 1 - livePi;
            }
            var liveTotals = detCopies.map(function (d, i) {
                return d + (secBK.bonusProbes[i].hit ? 1 : 0);
            });
            secBK.totalCounts = liveTotals;
            histOpts.probeCountOverlay = liveTotals;
            histOpts.probeCountTotal = N;
        }
        if (secBK.mode === 'ktrials' && secBK.hist) {
            histOpts.probeCountOverlay = secBK.hist.means;
            histOpts.probeCountTotal = N;
        }

        // Annotation label
        if (secBK.mode === 'ktrials' && secBK.hist) {
            var avgTotal = secBK.hist.means.reduce(function (a, b) { return a + b; }, 0);
            var avgBonus = avgTotal - detTotal;
            histOpts.detLabel = detTotal + ' deterministic + ' +
                fmtNum(avgBonus) + ' bonuses on avg = ' +
                fmtNum(avgTotal) + ' particles on avg';
        } else if (secBK.mode === 'single' && secBK.totalCounts) {
            var total = secBK.totalCounts.reduce(function (a, b) { return a + b; }, 0);
            var bonusTotal = total - detTotal;
            histOpts.detLabel = detTotal + ' deterministic + ' +
                bonusTotal + ' sampled bonuses = ' + total + ' particles';
        } else {
            histOpts.detLabel = detTotal + ' deterministic + independent Bernoulli bonuses';
        }

        drawLeftHistogram(ctx, L, histValues, histOpts);

        // --- Right side: N independent Bernoulli mini-CDFs ---
        var bkColor = S.METHOD_COLORS.branchkill;

        // Axes
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.cdfL, L.plotB); ctx.lineTo(L.cdfR, L.plotB);
        ctx.moveTo(L.cdfL, L.plotT); ctx.lineTo(L.cdfL, L.plotB);
        ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var ticks = [0, 0.5, 1.0];
        for (var ti = 0; ti < ticks.length; ti++) {
            var u = ticks[ti];
            ctx.fillText(u.toFixed(u === 0 || u === 1 ? 0 : 1), L.uToX(u), L.plotB + 4);
            ctx.beginPath(); ctx.moveTo(L.uToX(u), L.plotB); ctx.lineTo(L.uToX(u), L.plotB + 3);
            ctx.strokeStyle = '#999'; ctx.stroke();
        }
        ctx.fillStyle = '#888';
        ctx.font = 'italic 10px -apple-system, BlinkMacSystemFont, serif';
        ctx.fillText('x', L.cdfL + L.cdfW / 2, L.plotB + 18);

        // Draw each particle's Bernoulli CDF
        // The CDF models P(no bonus) = 1-p_i, so the step is at 1-p_i.
        // Probes right of the step (u >= 1-p_i) → bonus (filled dot on top line).
        for (var i = 0; i < N; i++) {
            var yC = L.idxToY(i);
            var yTop = yC - L.barH / 2;
            var yBot = yC + L.barH / 2;
            // Inset the CDF lines so there's visible space above/below for probe dashes
            var inset = L.barH * 0.15;
            var yCdfTop = yTop + inset;
            var yCdfBot = yBot - inset;
            var pi = N * weights[i] - detCopies[i];  // bonus probability
            var oneMinusP = 1 - pi;                   // step location
            var xStep = L.uToX(oneMinusP);

            var pColor = S.PALETTE[i];

            // Shaded region right of step (bonus zone)
            if (pi > 0.001) {
                ctx.fillStyle = pColor;
                ctx.globalAlpha = 0.08;
                ctx.fillRect(xStep, yTop, L.cdfR - xStep, yBot - yTop);
                ctx.globalAlpha = 1;
            }

            // Step function with inset CDF lines
            ctx.strokeStyle = pColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            // Bottom segment (CDF = 0): from u=0 to u=1-p_i
            if (oneMinusP > 0.001) {
                ctx.moveTo(L.cdfL, yCdfBot);
                ctx.lineTo(xStep, yCdfBot);
            }
            // Vertical jump at u=1-p_i
            if (pi > 0.001 && pi < 0.999) {
                ctx.moveTo(xStep, yCdfBot);
                ctx.lineTo(xStep, yCdfTop);
            }
            // Top segment (CDF = 1): from u=1-p_i to u=1
            if (pi < 0.999) {
                ctx.moveTo(oneMinusP > 0.001 ? xStep : L.cdfL, yCdfTop);
                ctx.lineTo(L.cdfR, yCdfTop);
            } else {
                ctx.moveTo(L.cdfL, yCdfTop);
                ctx.lineTo(L.cdfR, yCdfTop);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Open circle at bottom of step, filled at top
            var r = 2.5;
            if (pi > 0.001 && pi < 0.999) {
                ctx.beginPath();
                ctx.arc(xStep, yCdfBot, r, 0, 2 * Math.PI);
                ctx.strokeStyle = pColor; ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(xStep, yCdfTop, r, 0, 2 * Math.PI);
                ctx.fillStyle = pColor;
                ctx.fill();
            }

            // Probe (if single resample mode)
            if (secBK.mode === 'single' && secBK.bonusProbes) {
                var probe = secBK.bonusProbes[i];
                var xProbe = L.uToX(probe.u);
                // Right of step (hit): dot on top CDF line
                // Left of step (miss): dot on bottom CDF line
                var yDot = probe.hit ? yCdfTop : yCdfBot;
                ctx.strokeStyle = bkColor;
                ctx.lineWidth = 1.2;
                ctx.setLineDash([3, 2]);
                ctx.globalAlpha = 0.6;
                // Start from the row boundary (virtual x-axis for this mini-plot)
                var yRowBase = yC + L.rowH / 2;
                ctx.beginPath();
                ctx.moveTo(xProbe, yRowBase);
                ctx.lineTo(xProbe, yDot);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                // Marker: filled if hit (bonus), open if miss
                ctx.beginPath();
                ctx.arc(xProbe, yDot, 3.5, 0, 2 * Math.PI);
                if (probe.hit) {
                    ctx.fillStyle = bkColor;
                    ctx.fill();
                } else {
                    ctx.strokeStyle = bkColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }

        drawYAxis(ctx, L);
        cvBK._L = L;
    }

    // ================================================================
    //  DRAW: COUNTEREXAMPLE (section 5 sub)
    // ================================================================

    function drawCounterexample() {
        var cv = document.getElementById('cv-counter');
        var counterData = S.counterData;
        if (!cv || !counterData || !counterData.multi) { if (cv) S.resetCanvas(cv); return; }
        if (cv.offsetWidth === 0 || cv.offsetHeight === 0) return;
        var evM = S.evalEstimators(counterData.multi);
        var evS = S.evalEstimators(counterData.sys);
        if (!evM || !evS) { S.resetCanvas(cv); return; }
        drawEstimatorDist(cv, [
            { estimators: evM.estimators, color: S.METHOD_COLORS.multinomial, label: 'Multinomial' },
            { estimators: evS.estimators, color: S.METHOD_COLORS.systematic, label: 'Systematic' },
        ], evM.trueVal);
    }

    // ================================================================
    //  DRAW: ESTIMATOR DISTRIBUTION (KDE)
    // ================================================================

    function drawEstimatorDist(canvas, datasets, trueVal) {
        if (!datasets || datasets.every(function (d) { return !d.estimators; })) { S.resetCanvas(canvas); return; }
        var result = S.resetCanvas(canvas);
        var ctx = result.ctx, w = result.w, h = result.h;
        var nDS = datasets.length;
        var errBarH = 8;  // height for mean±std error bar per row
        var rowGap = nDS > 1 ? 4 : 0;
        var margin = { top: 12, right: 12, bottom: 26, left: 12 };
        var pL = margin.left, pR = w - margin.right;
        var pT = margin.top, pB = h - margin.bottom;
        var pW = pR - pL, pH = pB - pT;

        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);

        // Shared x range
        var allVals = datasets.reduce(function (acc, d) { return acc.concat(d.estimators || []); }, []);
        if (allVals.length === 0) return;
        var spread = Math.max(0.01, Math.max.apply(null, allVals) - Math.min.apply(null, allVals));
        var lo = Math.min.apply(null, allVals) - spread * 0.15;
        var hi = Math.max.apply(null, allVals) + spread * 0.15;

        function xToCanvas(v) { return pL + ((v - lo) / (hi - lo)) * pW; }

        // Build frequency tables + stats for each dataset
        var histData = datasets.map(function (d) {
            var freq = {};
            if (!d.estimators) return { freq: freq, maxCount: 0, mean: 0, std: 0 };
            var sum = 0, sumSq = 0, n = d.estimators.length;
            for (var i = 0; i < n; i++) {
                var key = d.estimators[i].toFixed(8);
                freq[key] = (freq[key] || 0) + 1;
                sum += d.estimators[i];
                sumSq += d.estimators[i] * d.estimators[i];
            }
            var maxCount = 0;
            for (var k in freq) if (freq[k] > maxCount) maxCount = freq[k];
            var mean = sum / n;
            var std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
            return { freq: freq, maxCount: maxCount, mean: mean, std: std };
        });

        // Divide vertical space into rows (one per dataset)
        var totalErrSpace = nDS * errBarH;
        var totalGaps = Math.max(0, nDS - 1) * rowGap;
        var histAreaH = pH - totalErrSpace - totalGaps;
        var rowH = histAreaH / nDS + errBarH;
        var rowHistH = rowH - errBarH;

        // Draw each dataset in its own row
        for (var ci = 0; ci < nDS; ci++) {
            var color = datasets[ci].color;
            var freq = histData[ci].freq;
            var rowTop = pT + ci * (rowH + rowGap);
            var rowHistBot = rowTop + rowHistH;
            var localMax = Math.max(1, histData[ci].maxCount);

            // Histogram lines
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            for (var key in freq) {
                var v = parseFloat(key);
                var cx = xToCanvas(v);
                var by = rowHistBot - (freq[key] / localMax) * rowHistH * 0.9;
                ctx.moveTo(cx, rowHistBot);
                ctx.lineTo(cx, by);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Row baseline
            ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(pL, rowHistBot); ctx.lineTo(pR, rowHistBot); ctx.stroke();

            // Mean ± std error bar below histogram
            var mean = histData[ci].mean;
            var std = histData[ci].std;
            var eby = rowHistBot + errBarH / 2 + 1;
            var mx = xToCanvas(mean);
            var loX = xToCanvas(mean - std);
            var hiX = xToCanvas(mean + std);
            ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(loX, eby); ctx.lineTo(hiX, eby);           // horizontal bar
            ctx.moveTo(loX, eby - 3); ctx.lineTo(loX, eby + 3);   // left cap
            ctx.moveTo(hiX, eby - 3); ctx.lineTo(hiX, eby + 3);   // right cap
            ctx.stroke();
            // Mean dot
            ctx.fillStyle = color; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(mx, eby, 2.5, 0, 2 * Math.PI); ctx.fill();
            ctx.globalAlpha = 1;

            // Label
            ctx.fillStyle = color;
            ctx.font = '9px -apple-system, sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText((datasets[ci].label || '') + ' \u03C3=' + std.toFixed(4), pL + 2, eby);
        }

        // True value line (spans all rows)
        if (trueVal != null && trueVal >= lo && trueVal <= hi) {
            var tx = xToCanvas(trueVal);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.beginPath(); ctx.moveTo(tx, pT); ctx.lineTo(tx, pB); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#555';
            ctx.font = '9px -apple-system, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText('true', tx, pT - 1);
        }

        // X-axis (at bottom)
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pL, pB); ctx.lineTo(pR, pB); ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#888'; ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var nTicks = 5;
        for (var t = 0; t <= nTicks; t++) {
            var v = lo + (hi - lo) * t / nTicks;
            ctx.fillText(v.toFixed(2), xToCanvas(v), pB + 3);
        }
        ctx.fillStyle = '#aaa';
        ctx.fillText('estimator value', pL + pW / 2, pB + 14);
    }

    // ================================================================
    //  DRAW: COMPARISON PANEL (section 7)
    // ================================================================

    function drawComparisonPanel() {
        var N = S.N;
        var weights = S.weights;
        var compData = S.compData;
        var cv = document.getElementById('cv-comparison');
        if (!cv) return;
        if (!compData) {
            // No trial data — draw weight bars only (no CDF, no error bars)
            if (cv.offsetWidth === 0 || cv.offsetHeight === 0) return;
            var result = S.resetCanvas(cv);
            var ctx = result.ctx, w = result.w, h = result.h;
            var margin = { top: 12, right: 12, bottom: 20, left: 12 };
            var pL = margin.left, pR = w - margin.right;
            var pT = margin.top, pB = h - margin.bottom;
            var pH = pB - pT;
            var rowH = pH / N, barH = rowH * 0.65;
            var maxProp = Math.max.apply(null, weights) * 1.15;
            function idxToY(i) { return pB - (i + 0.5) * rowH; }
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            for (var i = 0; i < N; i++) {
                var y = idxToY(i);
                var wBarW = (weights[i] / maxProp) * (pR - pL);
                ctx.fillStyle = '#ddd';
                ctx.fillRect(pR - wBarW, y - barH / 2, wBarW, barH);
                ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8;
                ctx.strokeRect(pR - wBarW, y - barH / 2, wBarW, barH);
                // Label
                ctx.fillStyle = S.PALETTE[i];
                ctx.font = 'bold 11px -apple-system, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(i + 1, pR + 8, y);
            }
            cv._L = {
                histR: pR, histW: pR - pL, histL: pL,
                barH: barH, idxToY: idxToY, histMaxVal: maxProp,
                cdfL: Infinity, cdfR: -Infinity,
                uToX: function () { return -1; },
            };
            return;
        }
        var result = S.resetCanvas(cv);
        var ctx = result.ctx, w = result.w, h = result.h;
        var margin = { top: 12, right: 12, bottom: 20, left: 12 };
        var pL = margin.left, pR = w - margin.right;
        var pT = margin.top, pB = h - margin.bottom;
        var pH = pB - pT;
        var rowH = pH / N, barH = rowH * 0.65;

        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);

        // Shared scale across all methods
        var allHists = [compData.multi, compData.strat, compData.sys, compData.resid];
        var maxPropVals = weights.map(function (w) { return w * 1.1; });
        allHists.forEach(function (hist) {
            hist.means.forEach(function (m, i) {
                maxPropVals.push((m + hist.stds[i]) / N);
            });
        });
        var maxProp = Math.max.apply(null, maxPropVals) * 1.05;

        function idxToY(i) { return pB - (i + 0.5) * rowH; }

        // Draw weight bars (grayed out)
        for (var i = 0; i < N; i++) {
            var y = idxToY(i);
            var wBarW = (weights[i] / maxProp) * (pR - pL);
            ctx.fillStyle = '#ddd';
            ctx.fillRect(pR - wBarW, y - barH / 2, wBarW, barH);
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(pR - wBarW, y - barH / 2, wBarW, barH);
        }

        // Draw each method's error bars
        var methods = [
            { hist: compData.multi, color: S.METHOD_COLORS.multinomial },
            { hist: compData.strat, color: S.METHOD_COLORS.stratified },
            { hist: compData.sys,   color: S.METHOD_COLORS.systematic },
            { hist: compData.resid, color: S.METHOD_COLORS.residual },
        ];
        var nMethods = methods.length;
        var slotH = barH / nMethods;

        for (var mi = 0; mi < nMethods; mi++) {
            var hist = methods[mi].hist;
            var color = methods[mi].color;
            var yOff = -barH / 2 + slotH * (mi + 0.5);

            for (var i = 0; i < N; i++) {
                var yBase = idxToY(i);
                var y = yBase + yOff;
                var mProp = hist.means[i] / N;
                var hiProp = (hist.means[i] + hist.stds[i]) / N;
                var loProp = Math.max(0, hist.means[i] - hist.stds[i]) / N;

                // Mean marker
                var mx = pR - (mProp / maxProp) * (pR - pL);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.moveTo(mx, y - slotH * 0.35);
                ctx.lineTo(mx, y + slotH * 0.35);
                ctx.stroke();

                // Error bar
                var xHi = pR - (hiProp / maxProp) * (pR - pL);
                var xLo = pR - (loProp / maxProp) * (pR - pL);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(xHi, y); ctx.lineTo(xLo, y);
                ctx.moveTo(xHi, y - 2); ctx.lineTo(xHi, y + 2);
                ctx.moveTo(xLo, y - 2); ctx.lineTo(xLo, y + 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // Y-axis
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pR, pT); ctx.lineTo(pR, pB); ctx.stroke();

        // Index labels
        for (var i = 0; i < N; i++) {
            ctx.fillStyle = S.PALETTE[i];
            ctx.font = 'bold 11px -apple-system, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(i + 1, pR + 8, idxToY(i));
        }

        // Store layout for weight dragging (compatible with initWeightDrag)
        cv._L = {
            histR: pR, histW: pR - pL, histL: pL,
            barH: barH, idxToY: idxToY,
            histMaxVal: maxProp,
            // No CDF in this panel
            cdfL: Infinity, cdfR: -Infinity,
            uToX: function () { return -1; },
        };
    }

    // ================================================================
    //  DRAW: HELPER for per-section estimator distribution
    // ================================================================

    function drawEstDist(canvasId, sec, color, label) {
        var cv = document.getElementById(canvasId);
        if (!cv) return;
        // Skip if canvas is hidden (zero size) — will be drawn on reveal
        if (cv.offsetWidth === 0 || cv.offsetHeight === 0) return;
        var hist = sec.hist;
        if (!hist || !hist.allCounts) { S.resetCanvas(cv); return; }
        // Recompute estimator values for current test function (cheap)
        var ev = S.evalEstimators(hist);
        if (!ev) { S.resetCanvas(cv); return; }
        drawEstimatorDist(cv,
            [{ estimators: ev.estimators, color: color, label: label }],
            ev.trueVal
        );
    }

    function drawCompEstDist() {
        var compData = S.compData;
        var cv = document.getElementById('cv-est-all');
        if (!cv || !compData) { if (cv) S.resetCanvas(cv); return; }
        // Recompute all estimator values for current test function
        var evM = S.evalEstimators(compData.multi);
        var evS = S.evalEstimators(compData.strat);
        var evY = S.evalEstimators(compData.sys);
        var evR = S.evalEstimators(compData.resid);
        if (!evM) { S.resetCanvas(cv); return; }
        drawEstimatorDist(cv, [
            { estimators: evM.estimators, color: S.METHOD_COLORS.multinomial, label: 'Multinomial' },
            { estimators: evS.estimators, color: S.METHOD_COLORS.stratified, label: 'Stratified' },
            { estimators: evY.estimators, color: S.METHOD_COLORS.systematic, label: 'Systematic' },
            { estimators: evR.estimators, color: S.METHOD_COLORS.residual,   label: 'Residual' },
        ], evM.trueVal);
    }

    // ================================================================
    //  EXPORT drawing functions onto SMC namespace
    // ================================================================

    S.panelLayout = panelLayout;
    S.drawYAxis = drawYAxis;
    S.drawLeftHistogram = drawLeftHistogram;
    S.drawRightCDF = drawRightCDF;
    S.drawStaircase = drawStaircase;
    S.drawProbe = drawProbe;
    S.drawPanel = drawPanel;
    S.drawMethodSection = drawMethodSection;
    S.drawResidualSection = drawResidualSection;
    S.drawBranchKillSection = drawBranchKillSection;
    S.drawCounterexample = drawCounterexample;
    S.drawEstimatorDist = drawEstimatorDist;
    S.drawComparisonPanel = drawComparisonPanel;
    S.drawEstDist = drawEstDist;
    S.drawCompEstDist = drawCompEstDist;

})();
