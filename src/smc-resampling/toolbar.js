// ================================================================
//  SMC Resampling — toolbar.js
//  Self-contained sticky toolbar: three custom dropdowns
//    - Weights preset (sparkline + name)
//    - f (test function) — LaTeX math via MathJax
//    - Residual phase-2 method (plain text)
//  All three share the createDropdown() factory, which handles
//  open/close, click-outside, active-row highlighting, and
//  MathJax typesetting for any $...$ we insert.
// ================================================================

import { N, PALETTE } from './config.js';
import { normalize, getResidualPhase2 } from './algorithms.js';

// ---- Weights presets ----
var PRESET_ORDER = ['skewed', 'uniform', 'degenerate', 'alternating'];
var PRESET_LABELS = {
    skewed: 'Skewed',
    uniform: 'Uniform',
    degenerate: 'Nearly degenerate',
    alternating: 'Alternating',
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

// ---- Test-function options (shared with main.js via .testfn-select inline
//      selects; toolbar renders the `math` form, inline selects show `text`) ----
export var TESTFN_OPTIONS = [
    { value: 'position',  text: 'i/N',       math: '\\(\\idx/\\np\\)' },
    { value: 'indicator', text: '1[i=4]',    math: '\\(\\mathbf{1}[\\idx{=}4]\\)' },
    { value: 'tail',      text: '1[i≥5]',    math: '\\(\\mathbf{1}[\\idx{\\geq}5]\\)' },
    { value: 'square',    text: '(i/N)²',    math: '\\((\\idx/\\np)^2\\)' },
    { value: 'evenodd',   text: '1[i even]', math: '\\(\\mathbf{1}[\\idx \\text{ even}]\\)' },
];

// ---- Residual phase-2 options ----
var PHASE2_OPTIONS = [
    { value: 'multinomial', text: 'Multinomial' },
    { value: 'stratified',  text: 'Stratified'  },
    { value: 'systematic',  text: 'Systematic'  },
];

// ---- Mini-histogram drawing (shared between sparkline + menu rows) ----
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

function typesetMath(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]);
    }
}

// ---- Generic dropdown factory ----
// Wires open/close + click-outside + active-row highlighting.
// Caller supplies renderers + selection state; factory keeps them in sync.
//
//   btn, menu         — elements from the toolbar markup
//   items             — array of { value, ... } (caller-defined shape)
//   getSelectedKey    — () => item.value of current selection (or null)
//   onSelect          — (item) => void; fires when a row is clicked
//   renderRow         — (rowEl, item) => void; paint one menu row
//   renderTrigger     — (btnEl, item|null) => void; paint closed-state button
//
// Returns { refresh } where refresh() re-renders the trigger when external
// state changes (e.g. user dragged weights, changed f from the inline select).
function createDropdown(opts) {
    var btn = opts.btn, menu = opts.menu;

    function findSelected() {
        var k = opts.getSelectedKey();
        return opts.items.find(function (it) { return it.value === k; }) || null;
    }

    function paintTrigger() {
        btn.innerHTML = '';
        opts.renderTrigger(btn, findSelected());
        var arrow = document.createElement('span');
        arrow.className = 'smc-toolbar-dropdown-arrow';
        arrow.textContent = '▾';
        btn.appendChild(arrow);
        typesetMath(btn);
    }

    function paintMenu() {
        menu.innerHTML = '';
        var selKey = opts.getSelectedKey();
        opts.items.forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'smc-toolbar-dropdown-row';
            if (item.value === selKey) row.classList.add('active');
            opts.renderRow(row, item);
            row.addEventListener('click', function () {
                menu.classList.remove('open');
                opts.onSelect(item);
                paintTrigger();
            });
            menu.appendChild(row);
        });
        typesetMath(menu);
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.classList.contains('open')) {
            menu.classList.remove('open');
        } else {
            // Close sibling dropdowns so only one is open at a time.
            document.querySelectorAll('.smc-toolbar-dropdown-menu.open').forEach(function (m) {
                if (m !== menu) m.classList.remove('open');
            });
            paintMenu();
            menu.classList.add('open');
        }
    });
    document.addEventListener('click', function (e) {
        if (!btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('open');
        }
    });

    paintTrigger();
    return { refresh: paintTrigger };
}

/**
 * Initialize the toolbar. Call once after DOM is ready.
 *
 * @param {object} opts
 * @param {() => number[]} opts.getWeights  — returns current weight vector
 */
export function initToolbar(opts) {
    var getWeights = opts.getWeights;

    // ---- "Pin on scroll" — JS-based fake-sticky ----
    // The toolbar stays at its authored position in the DOM (inside the
    // subsection where the user wrote it). Plain position:sticky would
    // unstick as soon as the user scrolls past that subsection's bottom
    // edge — the subsection is its containing block and sticky is scoped
    // to that. To have the toolbar stay visible across the rest of the
    // post, we leave it in flow, measure its authored y-position, and
    // flip to position:fixed when scroll passes that position. A
    // same-height placeholder prevents layout jump at the pin moment.
    var toolbar = document.getElementById('smc-toolbar');
    if (toolbar) {
        // Placeholder holds the toolbar's spot while it's pinned, so the
        // rest of the page doesn't jump. Width-determining theme classes
        // copied over so getBoundingClientRect().top stays honest as the
        // authored-position anchor regardless of pin state.
        var placeholder = document.createElement('div');
        placeholder.className = 'smc-toolbar-placeholder';
        ['wide', 'extra-wide', 'full-width'].forEach(function (c) {
            if (toolbar.classList.contains(c)) placeholder.classList.add(c);
        });
        toolbar.parentElement.insertBefore(placeholder, toolbar);
        // Remember authored location for unpin.
        var authoredParent = toolbar.parentElement;
        var authoredNextSibling = toolbar.nextSibling;
        var pinned = false;

        // The pinned toolbar is full-viewport-width, but its controls should
        // line up with the body-text column (so on wide screens where the
        // TOC sidebar is showing, controls don't sit in the empty left
        // margin). Measure the left edge of a non-`.wide` content element
        // — a section heading is a reliable proxy for the body column.
        function bodyTextLeft() {
            var h = document.querySelector('main section > h1, main section > h2, main section > h3');
            return h ? Math.max(0, h.getBoundingClientRect().left) : 0;
        }

        function updatePin() {
            var anchorTop = placeholder.getBoundingClientRect().top;
            var shouldPin = anchorTop <= 0;
            if (shouldPin && !pinned) {
                placeholder.style.height = toolbar.offsetHeight + 'px';
                // Move toolbar to <body> while pinned. Jez's theme applies
                // `transform: translateZ(0)` on several selectors (to stack
                // them above the TOC sidebar), which creates a containing
                // block for position:fixed descendants — that would shift
                // the "fixed" toolbar by the ancestor's offset and clamp
                // its width to the ancestor's width. Appending to body
                // avoids all of that and makes the pinned toolbar span the
                // full viewport at top: 0.
                document.body.appendChild(toolbar);
                toolbar.classList.add('smc-toolbar-pinned');
                toolbar.style.paddingLeft = bodyTextLeft() + 'px';
                pinned = true;
            } else if (!shouldPin && pinned) {
                toolbar.classList.remove('smc-toolbar-pinned');
                toolbar.style.paddingLeft = '';
                // Put toolbar back in its authored location so normal-flow
                // reading behaves the same as before the user scrolled.
                authoredParent.insertBefore(toolbar, authoredNextSibling);
                placeholder.style.height = '';
                pinned = false;
            } else if (pinned) {
                // Resync left padding on viewport resize.
                toolbar.style.paddingLeft = bodyTextLeft() + 'px';
            }
        }
        window.addEventListener('scroll', updatePin, { passive: true });
        window.addEventListener('resize', updatePin);
        updatePin();
    }

    // =========================================================
    // Weights preset dropdown
    // =========================================================
    // The weights vector can also be edited by dragging bars on the main
    // histogram. When the live weights happen to match a preset we highlight
    // it; otherwise the trigger shows "Choose preset".
    var weightsMatchPreset = function (weights) {
        for (var k = 0; k < PRESET_ORDER.length; k++) {
            var p = PRESETS[PRESET_ORDER[k]]();
            if (p.length !== weights.length) continue;
            var match = true;
            for (var i = 0; i < p.length; i++) {
                if (Math.abs(p[i] - weights[i]) > 1e-9) { match = false; break; }
            }
            if (match) return PRESET_ORDER[k];
        }
        return null;
    };

    var weightsBtn = document.getElementById('smc-toolbar-dropdown-btn');
    var weightsMenu = document.getElementById('smc-toolbar-dropdown-menu');
    var weightsDropdown = null;
    var lastWeightsJSON = '';

    if (weightsBtn && weightsMenu) {
        weightsDropdown = createDropdown({
            btn: weightsBtn,
            menu: weightsMenu,
            items: PRESET_ORDER.map(function (k) { return { value: k, label: PRESET_LABELS[k] }; }),
            getSelectedKey: function () { return weightsMatchPreset(getWeights()); },
            onSelect: function (item) {
                document.dispatchEvent(new CustomEvent('smc-preset-change', { detail: item.value }));
            },
            renderRow: function (row, item) {
                var cv = document.createElement('canvas');
                drawMiniWeights(cv, PRESETS[item.value](), 36, 24);
                row.appendChild(cv);
                var span = document.createElement('span');
                span.textContent = item.label;
                row.appendChild(span);
            },
            renderTrigger: function (btn, item) {
                var cv = document.createElement('canvas');
                cv.id = 'smc-toolbar-sparkline';
                drawMiniWeights(cv, getWeights(), 36, 24);
                btn.appendChild(cv);
                var lbl = document.createElement('span');
                lbl.id = 'smc-toolbar-dropdown-text';
                lbl.textContent = item ? item.label : 'Choose preset';
                btn.appendChild(lbl);
            },
        });
    }

    // =========================================================
    // f (test function) dropdown
    // =========================================================
    // State lives on the inline .testfn-select elements in the prose; the
    // toolbar mirrors their value. Changes here dispatch 'change' on one
    // inline select so main.js's existing handler runs (which keeps siblings
    // in sync and triggers the estimator redraw).
    var testfnSelects = function () {
        return Array.from(document.querySelectorAll('.testfn-select'));
    };

    var testfnBtn = document.getElementById('smc-toolbar-testfn-btn');
    var testfnMenu = document.getElementById('smc-toolbar-testfn-menu');
    var testfnDropdown = null;

    if (testfnBtn && testfnMenu) {
        testfnDropdown = createDropdown({
            btn: testfnBtn,
            menu: testfnMenu,
            items: TESTFN_OPTIONS,
            getSelectedKey: function () {
                var s = testfnSelects()[0];
                return s ? s.value : TESTFN_OPTIONS[0].value;
            },
            onSelect: function (item) {
                var sels = testfnSelects();
                if (sels.length) {
                    sels[0].value = item.value;
                    sels[0].dispatchEvent(new Event('change'));
                }
            },
            renderRow: function (row, item) {
                var span = document.createElement('span');
                span.innerHTML = item.math;
                row.appendChild(span);
            },
            renderTrigger: function (btn, item) {
                var span = document.createElement('span');
                span.innerHTML = item ? item.math : TESTFN_OPTIONS[0].math;
                btn.appendChild(span);
            },
        });
        // Re-render when an inline select changes (e.g. the counterexample
        // button sets it programmatically, or the user picks in the prose).
        testfnSelects().forEach(function (sel) {
            sel.addEventListener('change', function () { testfnDropdown.refresh(); });
        });
    }

    // =========================================================
    // Residual phase-2 dropdown
    // =========================================================
    // State lives on the inline #select-resid-phase2; toolbar mirrors it.
    var mainPhase2 = document.getElementById('select-resid-phase2');
    var phase2Btn = document.getElementById('smc-toolbar-phase2-btn');
    var phase2Menu = document.getElementById('smc-toolbar-phase2-menu');
    var phase2Dropdown = null;

    if (phase2Btn && phase2Menu) {
        phase2Dropdown = createDropdown({
            btn: phase2Btn,
            menu: phase2Menu,
            items: PHASE2_OPTIONS,
            getSelectedKey: function () {
                return mainPhase2 ? mainPhase2.value : getResidualPhase2();
            },
            onSelect: function (item) {
                if (mainPhase2) {
                    mainPhase2.value = item.value;
                    mainPhase2.dispatchEvent(new Event('change'));
                }
            },
            renderRow: function (row, item) {
                row.textContent = item.text;
            },
            renderTrigger: function (btn, item) {
                var span = document.createElement('span');
                span.textContent = item ? item.text : PHASE2_OPTIONS[0].text;
                btn.appendChild(span);
            },
        });
        if (mainPhase2) {
            mainPhase2.addEventListener('change', function () { phase2Dropdown.refresh(); });
        }
    }

    // =========================================================
    // Progressive reveal: testfn + phase2 items appear on scroll
    // =========================================================
    // f-chooser first matters at the Comparison section; phase-2 at §6.
    var testfnItem = document.getElementById('smc-toolbar-testfn');
    var phase2Item = document.getElementById('smc-toolbar-phase2');
    function updateReveal() {
        var testfnTrigger = document.getElementById('sec:comparison');
        var phase2Trigger = document.getElementById('cv-sec6');
        if (testfnItem && testfnTrigger) {
            testfnItem.style.display = testfnTrigger.getBoundingClientRect().top < 50 ? 'flex' : 'none';
        }
        if (phase2Item && phase2Trigger) {
            phase2Item.style.display = phase2Trigger.getBoundingClientRect().top < 50 ? 'flex' : 'none';
        }
    }
    window.addEventListener('scroll', updateReveal, { passive: true });
    window.addEventListener('resize', updateReveal);
    updateReveal();

    // =========================================================
    // 10Hz poll: refresh weights sparkline + reveal state
    // =========================================================
    // Weights can change from drag interactions without firing any event we
    // listen for. 100ms is imperceptible and cheaper than wiring drag hooks.
    setInterval(function () {
        if (weightsDropdown) {
            var json = JSON.stringify(getWeights());
            if (json !== lastWeightsJSON) {
                lastWeightsJSON = json;
                weightsDropdown.refresh();
            }
        }
        updateReveal();
    }, 100);
}
