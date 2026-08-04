// ================================================================
//  Resampling vs trained proposals — main.js
//  Builds the DOM inside the viz mounts, holds shared state,
//  wires controls, triggers renders.
// ================================================================

import { UNIFORM, STICKY, twist, qMix } from './model.js';
import { renderTrajectories, attachHover, depthColor } from './draw-trajectories.js';
import { renderAnnotated, FIXED } from './annotated.js';
import { renderCrossover, redrawCrossover } from './draw-crossover.js';
import { createDistBlock } from './dist-widget.js';

const state = {
    P: UNIFORM.map(r => r.slice()),
    bigram: false,
    s: FIXED.s,      // interactive panel starts from the annotated figure's run
    M: FIXED.M,
    R: 1500,
    seed: FIXED.seed,
};

const els = {};
let priorBlock = null, qstarBlock = null;
let xoverTimer = null;

const CTX_TITLES = ['after BOS', 'after <', 'after >'];
const CLS_TITLES = ['start', '⟨<, d=0⟩', '⟨<, d≥1⟩', '⟨>, d=0⟩', '⟨>, d≥1⟩'];

function legendHTML() {
    const sw = d => `<span class="rtp-swatch" style="background:${depthColor(d)}"></span>`;
    return `depth ${[0, 1, 2, 3, 4, 5].map(sw).join('')} (darker = deeper) ·
        band thickness = share of resampling weight ·
        <span style="color:#c33">×</span> killed/died ·
        <span style="color:#2a7a2a">¤</span>/<span style="color:#c33">¤</span> valid/invalid completion ·
        dashed line = resampling event · hover for exact state`;
}

export function init() {
    const mountA = document.getElementById('viz-annotated');
    const mountT = document.getElementById('viz-trajectories');
    const mountX = document.getElementById('viz-crossover');
    if (!mountT || !mountX) return;
    [mountA, mountT, mountX].forEach(m => { if (m) m.style.height = 'auto'; });

    if (mountA) {
        mountA.innerHTML = `
          <div class="rtp-panel"><canvas id="rtp-cv-a1" data-h="250"></canvas></div>
          <div class="rtp-panel"><canvas id="rtp-cv-a2" data-h="250"></canvas></div>
          <div class="rtp-legend">${legendHTML()}</div>
          <div class="rtp-tooltip" id="rtp-tip-a"></div>`;
    }
    mountT.innerHTML = `
      <div class="rtp-prior-box">
        <div class="rtp-prior-head">
          <span>prior \\(\\prior_0\\)</span>
          <label><input type="radio" name="rtp-order" value="unigram" checked> unigram</label>
          <label><input type="radio" name="rtp-order" value="bigram"> bigram</label>
          <button id="rtp-sticky" title="bigram prior with repetition bias">sticky preset</button>
        </div>
        <div class="rtp-prior-row">
          <canvas id="rtp-prior"></canvas>
          <span class="rtp-readout">
            \\(\\Z = \\)<span id="rtp-z" class="rtp-num"></span><br>
            weight growth per depth \\(1/f_{\\mathtt{>}} = \\)<span id="rtp-g" class="rtp-num"></span>
          </span>
        </div>
        <details class="rtp-qstar" id="rtp-qstar-details">
          <summary>optimal proposal \\(\\proposal^*(\\cdot \\mid \\text{state})\\)</summary>
          <canvas id="rtp-qstar"></canvas>
        </details>
      </div>
      <div class="rtp-runbar">
        <label>training \\(s\\) <input type="range" id="rtp-s" min="0" max="1" step="0.05">
          <span id="rtp-s-val" class="rtp-num"></span></label>
        <label>particles \\(M\\) <select id="rtp-m">
          <option>4</option><option>8</option><option selected>16</option></select></label>
        <button id="rtp-rerun">re-run</button>
      </div>
      <div class="rtp-panels">
        <div class="rtp-panel"><canvas id="rtp-cv-pt" data-h="290"></canvas></div>
        <div class="rtp-panel"><canvas id="rtp-cv-qt" data-h="290"></canvas></div>
      </div>
      <div class="rtp-info" id="rtp-info"></div>
      <div class="rtp-legend">${legendHTML()}</div>
      <div class="rtp-tooltip" id="rtp-tip-t"></div>`;
    mountX.innerHTML = `
      <div class="rtp-panel"><canvas id="rtp-cv-x" data-h="290"></canvas></div>
      <div class="rtp-info"><span id="rtp-progress"></span></div>`;

    els.cvPT = document.getElementById('rtp-cv-pt');
    els.cvQT = document.getElementById('rtp-cv-qt');
    els.cvX = document.getElementById('rtp-cv-x');
    els.info = document.getElementById('rtp-info');
    els.progress = document.getElementById('rtp-progress');
    els.zVal = document.getElementById('rtp-z');
    els.gVal = document.getElementById('rtp-g');
    els.sVal = document.getElementById('rtp-s-val');
    // typeset the injected static labels (values live in separate plain spans)
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([mountT]).catch(() => {});
    }
    els.qstarDetails = document.getElementById('rtp-qstar-details');

    const tipT = document.getElementById('rtp-tip-t');
    attachHover(els.cvPT, tipT);
    attachHover(els.cvQT, tipT);
    if (mountA) {
        els.cvA1 = document.getElementById('rtp-cv-a1');
        els.cvA2 = document.getElementById('rtp-cv-a2');
        const tipA = document.getElementById('rtp-tip-a');
        attachHover(els.cvA1, tipA);
        attachHover(els.cvA2, tipA);
        renderAnnotated(els);
    }

    priorBlock = createDistBlock(document.getElementById('rtp-prior'), {
        editable: true,
        getColumns: () => state.bigram
            ? CTX_TITLES.map((title, c) => ({ title, dist: state.P[c] }))
            : [{ title: 'any context', dist: state.P[0] }],
        onEdit: (col, dist) => {
            if (state.bigram) state.P[col] = dist;
            else state.P = [dist.slice(), dist.slice(), dist.slice()];
            refreshAll();
        },
    });
    qstarBlock = createDistBlock(document.getElementById('rtp-qstar'), {
        editable: false,
        colW: 100,
        getColumns: () => {
            const { qstar } = qMix(state.P, 1);
            return CLS_TITLES.map((title, c) => ({ title, dist: qstar[c] }));
        },
    });
    els.qstarDetails.addEventListener('toggle', () => {
        if (els.qstarDetails.open) qstarBlock.draw();
    });

    document.querySelectorAll('input[name="rtp-order"]').forEach(radio =>
        radio.addEventListener('change', () => {
            state.bigram = radio.value === 'bigram' && radio.checked;
            if (!state.bigram) {                  // collapse to the BOS-context row
                state.P = [0, 1, 2].map(() => state.P[0].slice());
            }
            refreshAll();
        }));
    document.getElementById('rtp-sticky').addEventListener('click', () => {
        state.P = STICKY.map(r => r.slice());
        state.bigram = true;
        document.querySelector('input[name="rtp-order"][value="bigram"]').checked = true;
        refreshAll();
    });
    const sSlider = document.getElementById('rtp-s');
    sSlider.value = state.s;
    sSlider.addEventListener('input', () => {
        state.s = Number(sSlider.value);
        els.sVal.textContent = state.s.toFixed(2);
        renderTrajectories(state, els);
        redrawCrossover(state, els);          // marker only; no recompute
    });
    document.getElementById('rtp-m').addEventListener('change', e => {
        state.M = Number(e.target.value); refreshAll();
    });
    document.getElementById('rtp-rerun').addEventListener('click', () => {
        state.seed = (state.seed * 69069 + 1) >>> 0;
        renderTrajectories(state, els);
    });
    window.addEventListener('resize', debounce(() => {
        if (els.cvA1) renderAnnotated(els);
        renderTrajectories(state, els);
        scheduleCrossover(0);
    }, 200));
    refreshAll();
}

function refreshAll() {
    els.sVal.textContent = state.s.toFixed(2);
    priorBlock.draw();
    if (els.qstarDetails.open) qstarBlock.draw();
    const { Z, f } = twist(state.P);
    els.zVal.textContent = Z.toPrecision(3);
    els.gVal.textContent = (1 / f[1]).toFixed(2);
    renderTrajectories(state, els);
    scheduleCrossover(400);
}

function scheduleCrossover(delay) {
    clearTimeout(xoverTimer);
    xoverTimer = setTimeout(() => renderCrossover(state, els), delay);
}

function debounce(fn, ms) {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
