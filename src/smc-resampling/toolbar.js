// ================================================================
//  SMC Resampling — toolbar.js
//  Self-contained sticky toolbar: weight sparkline + preset picker,
//  test function selector, residual phase-2 selector.
// ================================================================

import { N, PALETTE } from './config.js';
import { normalize, getResidualPhase2 } from './algorithms.js';

/**
 * Initialize the toolbar. Call once after DOM is ready.
 *
 * @param {object} opts
 * @param {() => number[]} opts.getWeights  — returns current weight vector
 */
export function initToolbar(opts) {
    var getWeights = opts.getWeights;

    // ---- Hoist toolbar out of its authored <section> up to <main> ----
    // With Pandoc's --section-divs, the toolbar sits inside the <section>
    // started by "## 2. Inverse transform sampling". `position: sticky`
    // is confined to its parent, so once the user scrolls past Section 2
    // the toolbar unsticks. Re-parent it to <main> (directly before the
    // section it came from) so it visually appears in roughly the same
    // place but sticks across the rest of the post.
    var toolbar = document.getElementById('smc-toolbar');
    var main = document.querySelector('main');
    if (toolbar && main && toolbar.parentElement !== main) {
        var section = toolbar.closest('main > section');
        if (section) section.after(toolbar);
    }

    // ---- Element references ----
    var sparkline    = document.getElementById('smc-toolbar-sparkline');
    var dropdownBtn  = document.getElementById('smc-toolbar-dropdown-btn');
    var dropdownText = document.getElementById('smc-toolbar-dropdown-text');
    var dropdownMenu = document.getElementById('smc-toolbar-dropdown-menu');
    var testfnItem   = document.getElementById('smc-toolbar-testfn');
    var phase2Item   = document.getElementById('smc-toolbar-phase2');
    var phase2Select = document.getElementById('smc-toolbar-phase2-select');
    var mainPhase2   = document.getElementById('select-resid-phase2');

    // ---- Preset definitions (self-contained, no dependency on main.js) ----
    var PRESET_ORDER = ['skewed', 'uniform', 'degenerate', 'alternating'];
    var PRESET_LABELS = {
        skewed: 'Skewed',
        uniform: 'Uniform',
        degenerate: 'Nearly degenerate',
        alternating: 'Alternating'
    };
    var PRESETS = {
        skewed: function () { return [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]; },
        uniform: function () { return new Array(N).fill(1 / N); },
        degenerate: function () { return [0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.89]; },
        alternating: function () {
            var w = [];
            for (var i = 0; i < N; i++) w.push(i % 2 === 0 ? 0.20 : 0.05);
            normalize(w);
            return w;
        },
    };

    // ---- Mini-histogram drawing ----
    function drawMiniWeights(canvas, weights, w, h) {
        var dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var maxW = Math.max.apply(null, weights);
        if (maxW === 0) return;
        var rowH = h / N;
        var barH = rowH * 0.7;
        for (var i = 0; i < N; i++) {
            var y  = h - (i + 0.5) * rowH - barH / 2;
            var bw = (weights[i] / maxW) * (w - 2);
            ctx.fillStyle = PALETTE[i];
            ctx.globalAlpha = 0.55;
            ctx.fillRect(w - 1 - bw, y, bw, barH);
        }
        ctx.globalAlpha = 1;
    }

    // ---- Update sparkline ----
    var lastJSON = '';
    function updateSparkline() {
        var weights = getWeights();
        var json = JSON.stringify(weights);
        if (json === lastJSON) return;
        lastJSON = json;
        if (sparkline) drawMiniWeights(sparkline, weights, 36, 24);
    }

    // ---- Build dropdown menu ----
    function buildMenu() {
        if (!dropdownMenu) return;
        dropdownMenu.innerHTML = '';
        PRESET_ORDER.forEach(function (key) {
            var row = document.createElement('div');
            row.className = 'smc-toolbar-dropdown-row';
            var cv = document.createElement('canvas');
            drawMiniWeights(cv, PRESETS[key](), 36, 24);
            row.appendChild(cv);
            var span = document.createElement('span');
            span.textContent = PRESET_LABELS[key];
            row.appendChild(span);
            row.addEventListener('click', function () {
                dropdownMenu.classList.remove('open');
                lastJSON = '';  // force sparkline refresh
                document.dispatchEvent(new CustomEvent('smc-preset-change', { detail: key }));
            });
            dropdownMenu.appendChild(row);
        });
    }

    // ---- Dropdown toggle ----
    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (dropdownMenu.classList.contains('open')) {
                dropdownMenu.classList.remove('open');
            } else {
                buildMenu();
                dropdownMenu.classList.add('open');
            }
        });
        document.addEventListener('click', function (e) {
            if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('open');
            }
        });
    }

    // ---- Phase-2 sync ----
    if (phase2Select && mainPhase2) {
        phase2Select.value = getResidualPhase2();
        phase2Select.addEventListener('change', function () {
            mainPhase2.value = phase2Select.value;
            mainPhase2.dispatchEvent(new Event('change'));
        });
        mainPhase2.addEventListener('change', function () {
            phase2Select.value = mainPhase2.value;
        });
    }

    // ---- Progressive reveal + sparkline update (rAF loop) ----
    function tick() {
        updateSparkline();
        // Show/hide toolbar sections based on scroll position
        var testfnTrigger = document.getElementById('btn-run-multi');
        var phase2Trigger = document.getElementById('cv-sec6');
        if (testfnItem && testfnTrigger) {
            testfnItem.style.display = testfnTrigger.getBoundingClientRect().top < 50 ? 'flex' : 'none';
        }
        if (phase2Item && phase2Trigger) {
            phase2Item.style.display = phase2Trigger.getBoundingClientRect().top < 50 ? 'flex' : 'none';
        }
        requestAnimationFrame(tick);
    }
    // Start tick loop + force initial draw
    lastJSON = '';
    updateSparkline();
    requestAnimationFrame(tick);
}
