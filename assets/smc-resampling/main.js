// ================================================================
//  SMC Resampling — main.js
//  State variables, interaction handlers, button wiring,
//  redrawAll, and initialization.
//  Reads from window.SMC for config, utilities, and drawing functions.
// ================================================================

'use strict';

(function () {

    var S = window.SMC;
    var N = S.N;

    // ================================================================
    //  STATE
    // ================================================================

    S.weights = [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05];
    S.probes = [];       // [{u}] user-placed probes in section 2
    S.hoverU = null;     // current hover position on CDF (or null)

    var dragProbeIdx = -1; // index of probe being dragged (-1 = none)

    // Sections 3-5: per-method state
    S.sec3 = { probes: [], counts: null, hist: null, mode: 'none' };
    S.sec4 = { probes: [], counts: null, hist: null, mode: 'none' };
    S.sec5 = { probes: [], counts: null, hist: null, mode: 'none', offset: Math.random() / N, dragging: false };

    // Section 5 counterexample
    S.counterData = null;

    // Section 6 residual
    S.sec6 = { detCounts: null, stoCounts: null, totalCounts: null, residualProbes: [], hist: null, mode: 'none' };

    // Branch-kill
    S.secBK = { detCounts: null, bonusProbes: null, totalCounts: null, hist: null, mode: 'none' };

    // Section 7 comparison
    S.compData = null;

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
        var cs = S.cumulativeSum(S.weights); cs[N - 1] = 1.0;

        var probeCounts = null;
        if (S.probes.length > 0) {
            probeCounts = new Array(N).fill(0);
            for (var pi = 0; pi < S.probes.length; pi++)
                probeCounts[S.searchSorted(cs, S.probes[pi].u)]++;
        }

        S.drawPanel(cvSec2, {
            histValues: S.weights.slice(),
            histMax: Math.max.apply(null, S.weights) * 1.15,
            probeCountOverlay: probeCounts,
            probeCountTotal: S.probes.length,
            probes: S.probes,
            probeColor: '#333',
            hoverU: S.hoverU,
        });
        // In-canvas annotations below CDF plot
        var L = cvSec2._L;
        if (L) {
            var ctx = cvSec2.getContext('2d');
            var annotY = L.plotB + 14;
            // Left annotation: drag instruction
            ctx.fillStyle = '#999';
            ctx.globalAlpha = 0.7;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText('Drag bars/endpoints to adjust weights.', L.histL + 2, annotY);
            // Right annotation: probe instruction + clear button
            var probeTextY = annotY;
            ctx.fillStyle = '#888';
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            var instrText = 'Click to place probes x\u1D62';
            ctx.fillText(instrText, L.cdfL, probeTextY);
            // "Clear probes" button (only when probes exist)
            if (S.probes.length > 0) {
                var clearText = '[Clear probes]';
                var clearX = L.cdfL;
                var clearY = probeTextY + 13;
                ctx.fillStyle = 'var(--s-accent, #467)';
                // Use a solid color since var() doesn't work in canvas
                ctx.fillStyle = '#467';
                ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.fillText(clearText, clearX, clearY);
                // Store hit region for click detection
                var tw = ctx.measureText(clearText).width;
                cvSec2._clearProbeBtn = { x: clearX, y: clearY, w: tw, h: 12 };
            } else {
                cvSec2._clearProbeBtn = null;
            }
            ctx.globalAlpha = 1;
        }
    }

    // ================================================================
    //  SECTION 2 — WEIGHT SETTER
    // ================================================================

    function setWeight(i, target) {
        target = Math.max(S.MIN_W, Math.min(1 - (N - 1) * S.MIN_W, target));
        var sumOthers = S.weights.reduce(function (s, wi, j) { return j === i ? s : s + wi; }, 0);
        if (sumOthers > 1e-10) {
            var scale = (1 - target) / sumOthers;
            for (var j = 0; j < N; j++) {
                if (j === i) S.weights[j] = target;
                else S.weights[j] = Math.max(S.MIN_W, S.weights[j] * scale);
            }
        } else {
            S.weights[i] = target;
            var rest = (1 - target) / (N - 1);
            for (var j = 0; j < N; j++) if (j !== i) S.weights[j] = rest;
        }
        S.normalize(S.weights);
    }

    // ================================================================
    //  SHARED: weight dragging from ANY panel canvas
    // ================================================================

    var globalWeightDrag = { active: false, idx: -1, canvas: null };

    function initWeightDrag(canvas) {
        function onDown(e) {
            var L = canvas._L; if (!L) return;
            var pos = S.getPos(canvas, e);

            // Check CDF boundary circles first
            if (pos.x >= L.cdfL - 10 && pos.x <= L.cdfR + 10) {
                var cs = S.cumulativeSum(S.weights);
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
        var pos = S.getPos(globalWeightDrag.canvas, e);

        if (globalWeightDrag.type === 'hist') {
            var barW = Math.max(0, L.histR - pos.x);
            var maxVal = L.histMaxVal || Math.max.apply(null, S.weights) * 1.15;
            var newW = Math.max(S.MIN_W, (barW / L.histW) * maxVal);
            setWeight(globalWeightDrag.idx, newW);
        } else if (globalWeightDrag.type === 'cdf') {
            var u = L.xToU(pos.x);
            var cs = S.cumulativeSum(S.weights);
            var idx = globalWeightDrag.idx;
            var lo = (idx === 0 ? 0 : cs[idx - 1]) + S.MIN_W;
            var hi = (idx === N - 1 ? 1 : cs[idx + 1]) - S.MIN_W;
            var newF = Math.max(lo, Math.min(hi, u));
            var prevF = idx === 0 ? 0 : cs[idx - 1];
            S.weights[idx] = newF - prevF;
            if (idx < N - 1) {
                var nextF = cs[idx + 1];
                S.weights[idx + 1] = nextF - newF;
            }
            for (var i = 0; i < N; i++) S.weights[i] = Math.max(S.MIN_W, S.weights[i]);
            S.normalize(S.weights);
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
            for (var i = 0; i < S.probes.length; i++) {
                var px = L.uToX(S.probes[i].u);
                if (Math.abs(pos.x - px) < 10 && pos.y >= L.plotB - 5 && pos.y <= L.plotB + 15) return i;
            }
            return -1;
        }

        function onDown(e) {
            var L = canvas._L;
            if (!L) return;
            var pos = S.getPos(canvas, e);

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
            var pos = S.getPos(canvas, e);

            if (dragProbeIdx >= 0) {
                e.preventDefault();
                S.probes[dragProbeIdx].u = L.xToU(pos.x);
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
                S.hoverU = L.xToU(pos.x);
            } else {
                S.hoverU = null;
            }
            redrawAll();
        }

        function onUp(e) {
            if (!mouseIsDown) return;
            mouseIsDown = false;
            var L = canvas._L;

            if (dragProbeIdx >= 0) { dragProbeIdx = -1; redrawAll(); return; }

            if (L && downPos) {
                var pos = S.getPos(canvas, e);
                // Check if click hit the "Clear probes" button
                var cb = canvas._clearProbeBtn;
                if (cb && pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y - 2 && pos.y <= cb.y + cb.h + 2) {
                    S.probes = [];
                    redrawAll();
                    downPos = null;
                    return;
                }
                if (pos.x >= L.cdfL && pos.x <= L.cdfR) {
                    if (Math.hypot(pos.x - downPos.x, pos.y - downPos.y) < 5) {
                        var u = L.xToU(pos.x);
                        if (u >= 0 && u <= 1) {
                            if (S.probes.length >= N) S.probes.shift();
                            S.probes.push({ u: u });
                            redrawAll();
                        }
                    }
                }
            }
            downPos = null;
        }

        function onLeave() {
            S.hoverU = null;
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
        S.drawMethodSection(cvSec3, S.sec3, S.METHOD_COLORS.multinomial);
        // Section 4
        S.drawMethodSection(cvSec4, S.sec4, S.METHOD_COLORS.stratified, { strata: true });
        // Section 5 — always build comb probes from offset, but only
        // show empirical histogram when mode is 'single' or 'ktrials'
        var sysProbes = [];
        for (var k = 0; k < N; k++) sysProbes.push({ u: S.sec5.offset + k / N });
        S.sec5.probes = sysProbes;
        S.drawMethodSection(cvSec5, S.sec5, S.METHOD_COLORS.systematic, { comb: true });
        // Section 5 counterexample
        S.drawCounterexample();
        // Section 6
        S.drawResidualSection();
        // Branch-kill
        S.drawBranchKillSection();
        // Section 7
        S.drawComparisonPanel();
        // Estimator distributions for sections 3-6
        S.drawEstDist('cv-est-multi', S.sec3, S.METHOD_COLORS.multinomial, 'Multinomial');
        S.drawEstDist('cv-est-strat', S.sec4, S.METHOD_COLORS.stratified, 'Stratified');
        S.drawEstDist('cv-est-sys',   S.sec5, S.METHOD_COLORS.systematic, 'Systematic');
        S.drawEstDist('cv-est-resid', S.sec6, S.METHOD_COLORS.residual,   'Residual');
        S.drawEstDist('cv-est-bk',   S.secBK, S.METHOD_COLORS.branchkill, 'Branch-kill');
        // Section 7 overlaid distributions
        S.drawCompEstDist();
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
            var pos = S.getPos(cvSec5, e);
            var hx = L.uToX(S.sec5.offset);
            if (Math.abs(pos.x - hx) < 15 && pos.y > L.plotB - 10) {
                S.sec5.dragging = true; e.preventDefault();
            }
        }
        function onMove(e) {
            if (!S.sec5.dragging) return;
            e.preventDefault();
            var L = cvSec5._L; if (!L) return;
            S.sec5.offset = Math.max(0, Math.min(1 / N - 1e-9, L.xToU(S.getPos(cvSec5, e).x)));
            S.sec5.mode = 'single';
            var cs = S.cumulativeSum(S.weights); cs[N - 1] = 1.0;
            var sysProbes = [];
            for (var k = 0; k < N; k++) sysProbes.push({ u: S.sec5.offset + k / N });
            S.sec5.probes = sysProbes;
            S.sec5.counts = S.countIndices(sysProbes.map(function (p) { return S.searchSorted(cs, p.u); }), N);
            redrawAll();
        }
        function onUp() { S.sec5.dragging = false; }
        cvSec5.addEventListener('mousedown', onDown);
        cvSec5.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    })();

    // ---- Helper: resample-once for a method section ----
    function doResampleOnce(sec, method) {
        var cs = S.cumulativeSum(S.weights); cs[N - 1] = 1.0;
        var draws = Array.from({ length: N }, function () { return Math.random(); });
        sec.probes = draws.map(function (u) { return { u: u }; });
        var indices = method(S.weights);
        sec.counts = S.countIndices(indices, N);
        if (method === S.resample.multinomial) {
            sec.probes = draws.map(function (u) { return { u: u }; });
            sec.counts = S.countIndices(draws.map(function (u) { return S.searchSorted(cs, u); }), N);
        } else if (method === S.resample.stratified) {
            var ps = Array.from({ length: N }, function (_, k) { return (Math.random() + k) / N; });
            sec.probes = ps.map(function (u) { return { u: u }; });
            sec.counts = S.countIndices(ps.map(function (u) { return S.searchSorted(cs, u); }), N);
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
            sec.hist = S.runTrials(method, K);
            sec.mode = 'ktrials';
            sec.probes = [];
            var ev = S.evalEstimators(sec.hist);
            var estStd = ev ? Math.sqrt(ev.estVar) : 0;
            setMathHTML('var-' + prefix,
                'std of estimator ' + S.getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
            var estEl = document.getElementById('est-' + prefix);
            if (estEl) estEl.classList.add('visible');
            redrawAll();
        });
    }

    // Section 3
    wireMethodButtons('multi', S.sec3, S.resample.multinomial);
    // Section 4
    wireMethodButtons('strat', S.sec4, S.resample.stratified);

    // Section 5
    document.getElementById('btn-resample-sys').addEventListener('click', function () {
        S.sec5.offset = Math.random() / N;
        S.sec5.mode = 'single';
        var cs = S.cumulativeSum(S.weights); cs[N - 1] = 1.0;
        var sysProbes = [];
        for (var k = 0; k < N; k++) sysProbes.push({ u: S.sec5.offset + k / N });
        S.sec5.probes = sysProbes;
        S.sec5.counts = S.countIndices(sysProbes.map(function (p) { return S.searchSorted(cs, p.u); }), N);
        redrawAll();
    });
    document.getElementById('btn-clear-sys').addEventListener('click', function () {
        S.sec5.counts = null; S.sec5.hist = null; S.sec5.mode = 'none';
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
            S.sec5.hist = S.runTrials(S.resample.systematic, K);
            S.sec5.mode = 'ktrials';
            S.sec5.probes = [];
            var ev = S.evalEstimators(S.sec5.hist);
            var estStd = ev ? Math.sqrt(ev.estVar) : 0;
            setMathHTML('var-sys',
                'std of estimator ' + S.getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
            var estEl = document.getElementById('est-sys');
            if (estEl) estEl.classList.add('visible');
            redrawAll();
        });
    })();

    // Section 5 counterexample
    var counterPreWeights = null;  // weights before counterexample changed them
    // PRESETS removed — uses PRESETS (defined below, available at call time)
    function clearCounterDisplay() {
        S.counterData = null;
        document.getElementById('var-counter').textContent = '';
        var estEl = document.getElementById('est-counter');
        if (estEl) estEl.classList.remove('visible');
    }
    function applyCounterPreset() {
        var key = document.getElementById('select-counter-weights').value;
        if (!counterPreWeights) counterPreWeights = S.weights.slice();
        S.weights = PRESETS[key]();
        clearCounterDisplay();
        redrawAll();
    }
    document.getElementById('select-counter-weights').addEventListener('change', function () {
        applyCounterPreset();
    });
    document.getElementById('btn-clear-counter').addEventListener('click', function () {
        clearCounterDisplay();
        redrawAll();
    });
    document.getElementById('btn-reset-counter-weights').addEventListener('click', function () {
        if (counterPreWeights) {
            S.weights = counterPreWeights;
            counterPreWeights = null;
        }
        clearCounterDisplay();
        redrawAll();
    });
    (function () {
        var slider = document.getElementById('slider-K-counter');
        var valSpan = document.getElementById('val-K-counter');
        slider.addEventListener('input', function () { valSpan.textContent = slider.value; });
    })();
    document.getElementById('btn-run-counter').addEventListener('click', function () {
        var key = document.getElementById('select-counter-weights').value;
        if (!counterPreWeights) counterPreWeights = S.weights.slice();
        S.weights = PRESETS[key]();
        var K = parseInt(document.getElementById('slider-K-counter').value, 10);
        var perm = document.getElementById('chk-permute').checked;
        var sysAllCounts = new Array(K);
        var multiAllCounts = new Array(K);
        for (var t = 0; t < K; t++) {
            var sIdx;
            if (perm) {
                var order = Array.from({ length: N }, function (_, i) { return i; });
                for (var i = N - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
                }
                var permW = order.map(function (i) { return S.weights[i]; });
                var rawIdx = S.resample.systematic(permW);
                sIdx = rawIdx.map(function (i) { return order[i]; });
            } else {
                sIdx = S.resample.systematic(S.weights);
            }
            sysAllCounts[t] = S.countIndices(sIdx, N);
            multiAllCounts[t] = S.countIndices(S.resample.multinomial(S.weights), N);
        }
        S.counterData = {
            sys:   { allCounts: sysAllCounts, K: K },
            multi: { allCounts: multiAllCounts, K: K },
        };
        setMathHTML('var-counter', S.getTestFnLabel());
        var estEl = document.getElementById('est-counter');
        if (estEl) estEl.classList.add('visible');
        redrawAll();
    });

    // Section 6 residual
    document.getElementById('btn-resample-resid').addEventListener('click', function () {
        var p2 = S.residualPhase2;
        var copies = S.weights.map(function (wi) { return Math.floor(N * wi); });
        var R = N - copies.reduce(function (a, b) { return a + b; }, 0);
        var res = S.weights.map(function (wi, i) { return wi - copies[i] / N; });
        var resSum = res.reduce(function (a, b) { return a + b; }, 0);
        var normRes = resSum > 0 ? res.map(function (r) { return r / resSum; }) : S.weights.slice();
        var cs = S.cumulativeSum(normRes); cs[N - 1] = 1.0;

        // Generate phase-2 probes using the selected method
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
            stoCounts[S.searchSorted(cs, residualProbes[i].u)]++;
        }
        var totalCounts = copies.map(function (d, i) { return d + stoCounts[i]; });

        S.sec6.detCounts = copies;
        S.sec6.stoCounts = stoCounts;
        S.sec6.totalCounts = totalCounts;
        S.sec6.residualProbes = residualProbes;
        S.sec6.mode = 'single';
        redrawAll();
    });
    // Phase-2 method selector
    document.getElementById('select-resid-phase2').addEventListener('change', function (e) {
        S.residualPhase2 = e.target.value;
        // Update pseudocode to reflect the selected method
        var commentEl = document.getElementById('resid-phase2-comment');
        var codeEl = document.getElementById('resid-phase2-code');
        if (commentEl && codeEl) {
            commentEl.textContent = S.residualPhase2;
            var codeLines = {
                multinomial: 'positions = random(R)                               <span class="c1"># multinomial: R independent probes</span>',
                stratified:  'positions = (random(R) + range(R)) / R              <span class="c1"># stratified: one probe per stratum</span>',
                systematic:  'positions = (random() + np.arange(R)) / R           <span class="c1"># systematic: single-offset comb</span>',
            };
            codeEl.innerHTML = codeLines[S.residualPhase2] || codeLines.multinomial;
        }
        // Clear results (algorithm changed)
        S.sec6.detCounts = null; S.sec6.stoCounts = null; S.sec6.totalCounts = null;
        S.sec6.residualProbes = []; S.sec6.hist = null; S.sec6.mode = 'none';
        document.getElementById('var-resid').textContent = '';
        var estEl = document.getElementById('est-resid');
        if (estEl) estEl.classList.remove('visible');
        redrawAll();
    });

    document.getElementById('btn-clear-resid').addEventListener('click', function () {
        S.sec6.detCounts = null; S.sec6.stoCounts = null; S.sec6.totalCounts = null;
        S.sec6.residualProbes = []; S.sec6.hist = null; S.sec6.mode = 'none';
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
            S.sec6.hist = S.runTrials(function (w) { return S.resample.residual(w, S.residualPhase2); }, K);
            S.sec6.mode = 'ktrials';
            var ev = S.evalEstimators(S.sec6.hist);
            var estStd = ev ? Math.sqrt(ev.estVar) : 0;
            setMathHTML('var-resid',
                'std of estimator ' + S.getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
            var estEl = document.getElementById('est-resid');
            if (estEl) estEl.classList.add('visible');
            redrawAll();
        });
    })();

    // Branch-kill
    document.getElementById('btn-resample-bk').addEventListener('click', function () {
        var det = S.weights.map(function (wi) { return Math.floor(N * wi); });
        var bonusProbes = S.weights.map(function (wi, i) {
            var p = N * wi - det[i];
            var u = Math.random();
            return { u: u, p: p, hit: u >= 1 - p };
        });
        var total = det.map(function (d, i) { return d + (bonusProbes[i].hit ? 1 : 0); });
        S.secBK.detCounts = det;
        S.secBK.bonusProbes = bonusProbes;
        S.secBK.totalCounts = total;
        S.secBK.hist = null;
        S.secBK.mode = 'single';
        redrawAll();
    });
    document.getElementById('btn-clear-bk').addEventListener('click', function () {
        S.secBK.detCounts = null; S.secBK.bonusProbes = null; S.secBK.totalCounts = null;
        S.secBK.hist = null; S.secBK.mode = 'none';
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
            S.secBK.hist = S.runTrials(S.resample.branchkill, K);
            S.secBK.mode = 'ktrials';
            var ev = S.evalEstimators(S.secBK.hist);
            var estStd = ev ? Math.sqrt(ev.estVar) : 0;
            setMathHTML('var-bk',
                'std of estimator ' + S.getTestFnLabel() + ' = ' + estStd.toFixed(4) + '  (' + K + ' trials)');
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
                S.compData = {
                    multi: S.runTrials(S.resample.multinomial, K),
                    strat: S.runTrials(S.resample.stratified, K),
                    sys:   S.runTrials(S.resample.systematic, K),
                    resid: S.runTrials(function (w) { return S.resample.residual(w, S.residualPhase2); }, K),
                };
                ['multi', 'strat', 'sys', 'resid'].forEach(function (key) {
                    var ev = S.evalEstimators(S.compData[key]);
                    var std = ev ? Math.sqrt(ev.estVar).toFixed(4) : '—';
                    document.getElementById('comp-std-' + key).textContent = std;
                });
                var estEl = document.getElementById('est-comparison');
                if (estEl) estEl.classList.add('visible');
                redrawAll();
            }, 0);
        });
    })();

    // Test function selectors — populate all .testfn-select elements and sync them
    var testFnOptions = [
        { value: 'position', label: 'i/N  (mean position)' },
        { value: 'indicator', label: '1{i=k}  (particle count)' },
        { value: 'tail', label: '1{i\u22655}  (upper tail)' },
        { value: 'square', label: '(i/N)\u00B2  (squared position)' },
        { value: 'evenodd', label: '1{i even}  (even/odd class)' },
    ];
    var allTestFnSelects = document.querySelectorAll('.testfn-select');
    allTestFnSelects.forEach(function (sel) {
        testFnOptions.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            sel.appendChild(o);
        });
        sel.value = S.testFnKey;
        sel.addEventListener('change', function (e) {
            S.testFnKey = e.target.value;
            // Sync all selectors
            allTestFnSelects.forEach(function (s) { s.value = S.testFnKey; });
            // Recompute estimator stats from stored counts (no re-running needed)
            // Update variance labels for sections that have trial data
            [['multi', S.sec3], ['strat', S.sec4], ['sys', S.sec5], ['resid', S.sec6]].forEach(function (pair) {
                var prefix = pair[0], sec = pair[1];
                if (sec.hist && sec.hist.allCounts) {
                    var ev = S.evalEstimators(sec.hist);
                    if (ev) {
                        setMathHTML('var-' + prefix,
                            'std of estimator ' + S.getTestFnLabel() + ' = ' + Math.sqrt(ev.estVar).toFixed(4) + '  (' + sec.hist.K + ' trials)');
                    }
                }
            });
            // Update §7 comparison labels
            if (S.compData) {
                ['multi', 'strat', 'sys', 'resid'].forEach(function (key) {
                    var ev = S.evalEstimators(S.compData[key]);
                    if (ev) {
                        var std = Math.sqrt(ev.estVar).toFixed(4);
                        document.getElementById('comp-var-' + key).textContent = 'std=' + std;
                        document.getElementById('td-var-' + key).textContent = std;
                        document.getElementById('comp-std-' + key).textContent = std;
                    }
                });
            }
            // Update counterexample label (data recomputes from stored counts)
            if (S.counterData) {
                setMathHTML('var-counter', S.getTestFnLabel());
            }
            // Update branch-kill label
            if (S.secBK.hist) {
                var evBK = S.evalEstimators(S.secBK.hist);
                if (evBK) setMathHTML('var-bk',
                    'std of estimator ' + S.getTestFnLabel() + ' = ' + Math.sqrt(evBK.estVar).toFixed(4) + '  (' + S.secBK.hist.K + ' trials)');
            }
            // setTimeout ensures browser composites canvas changes after select dropdown closes
            setTimeout(redrawAll, 0);
        });
    });

    // Section 2 presets
    function clearAll() {
        S.probes = [];
        [S.sec3, S.sec4, S.sec5, S.sec6].forEach(function (s) {
            s.probes = []; s.counts = null; s.hist = null; s.mode = 'none';
            if (s.offset !== undefined) s.offset = 0.5 / N;
        });
        S.compData = null; S.counterData = null;
        document.querySelectorAll('.var-display').forEach(function (el) { el.textContent = ''; });
    }
    // Clear probes button is now drawn inside the canvas (see drawSection2)

    // Preset weight configurations (used by toolbar.js via custom events)
    var PRESETS = {
        uniform: function () { return new Array(N).fill(1 / N); },
        skewed: function () { return [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]; },
        degenerate: function () { return [0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.89]; },
        alternating: function () { var w = []; for (var i = 0; i < N; i++) w.push(i % 2 === 0 ? 0.20 : 0.05); S.normalize(w); return w; },
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
            S.weights = PRESETS[key]();
            clearAll();
            redrawAll();
        }
    });

    // Initial draw — defer if DOM not ready yet (scripts at bottom of body
    // may run before layout is complete)
    function initialDraw() { redrawAll(); }
    if (document.readyState !== 'loading') {
        initialDraw();
    } else {
        document.addEventListener('DOMContentLoaded', initialDraw);
    }

})();
