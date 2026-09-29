// ================================================================
//  Discrete entropy as area: an 8-outcome pmf, and the same pmf as
//  columns of width p(x) and height -log2 p(x).
//  The bars edit a base pmf p (drag, or pick a preset); the figure
//  shows its tempered version p^β, which is p itself at β = 1.
// ================================================================

import { log2, softmax, shannonH, temper, withProb, clamp } from './dist.js';
import { Plot, txt } from './svgplot.js';
import { setText } from './ui.js';

const NAMES = 'abcdefgh'.split('');
const MIN_P = 0.01; // floor for dragged probabilities, as in the temperature post

// The same presets as the temperature post, plus this figure's opening pmf.
const PRESETS = {
    default:  softmax([1.9, 0.2, 1.1, -0.6, 0.7, -1.3, 0.1, -0.3], 1),
    unimodal: [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05],
    uniform:  [1, 1, 1, 1, 1, 1, 1, 1],
    peaked:   [0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03],
    bimodal:  [0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15],
    zipf:     [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8],
};
const normalize = p => { const Z = p.reduce((a, b) => a + b, 0); return p.map(v => v / Z); };

export function initDiscrete() {
    const svgPmf = document.getElementById('de-a-pmf');
    const svgArea = document.getElementById('de-a-area');
    const slider = document.getElementById('de-a-beta');
    if (!svgPmf || !svgArea || !slider) return;
    const preset = document.getElementById('de-a-preset');
    const P1 = new Plot(svgPmf, { w: 520, h: 300 });
    const P2 = new Plot(svgArea, { w: 520, h: 300 });
    let base = PRESETS.default.slice();
    const order = base.map((_, i) => i); // display slot -> outcome
    let dragK = -1;                      // outcome being dragged (-1 = none)

    function draw() {
        const beta = +slider.value;
        setText(document.getElementById('de-a-betav'), beta.toFixed(2));
        const p = temper(base, beta);
        const H = shannonH(p);
        const tempered = Math.abs(beta - 1) > 1e-9;

        P1.domain(0.4, 8.6, 0, 1.12);
        P1.axes({ xticks: [], yticks: [0, .25, .5, .75, 1], ylabel: 'p(x)' });
        order.forEach((k, j) => {
            const x = j + 1;
            P1.rect(x - .32, 0, x + .32, p[k], 'bar');
            if (tempered) P1.rect(x - .32, 0, x + .32, base[k], 'bar-base');
            P1.line(x - .32, base[k], x + .32, base[k], 'grip' + (k === dragK ? ' active' : ''));
            txt(P1.back, P1.X(x), P1.pb + 16, NAMES[k], 'axl', { 'text-anchor': 'middle' });
        });
        P1.hline(1, 'ref');
        txt(P1.front, P1.pr - 4, P1.Y(1) - 6, 'a probability never exceeds 1', 'lbl soft', { 'text-anchor': 'end' });

        P2.domain(0, 1, 0, 10);
        P2.axes({
            xticks: [0, .25, .5, .75, 1], yticks: [0, 2, 4, 6, 8, 10],
            xlabel: 'cumulative probability', ylabel: '−log₂ p(x)',
        });
        let u = 0;
        for (const k of order) {
            const s = -log2(p[k]);
            P2.rect(u, 0, u + p[k], s, 'bar');
            if (p[k] > 0.045) {
                txt(P2.data, P2.X(u + p[k] / 2), P2.Y(Math.min(s, 9.4)) - 5, NAMES[k], 'axl', { 'text-anchor': 'middle' });
            }
            u += p[k];
        }
        P2.hline(H, 'hmark');
        txt(P2.front, P2.pr - 4, P2.Y(H) - 6, 'H = average height = ' + H.toFixed(2), 'lbl b', { 'text-anchor': 'end' });
        setText(document.getElementById('de-a-H'), H.toFixed(3));
        setText(document.getElementById('de-a-Hbase'), shannonH(base).toFixed(3));
    }

    // ---- dragging the base bars (anywhere in a bar's column) ----

    function slotAt(pt) {
        if (pt.y < P1.pt - 8 || pt.y > P1.pb + 8) return -1;
        const j = Math.round(P1.invX(pt.x)) - 1;
        return j >= 0 && j < order.length && Math.abs(P1.invX(pt.x) - (j + 1)) < .45 ? j : -1;
    }
    function dragTo(pt) {
        base = withProb(base, dragK, clamp(P1.invY(pt.y), 0, 1), MIN_P);
        if (preset) preset.value = 'custom';
        draw();
    }
    svgPmf.addEventListener('pointerdown', e => {
        const j = slotAt(P1.svgPoint(e));
        if (j === -1) return;
        dragK = order[j];
        svgPmf.setPointerCapture(e.pointerId);
        e.preventDefault();
        dragTo(P1.svgPoint(e));
    });
    svgPmf.addEventListener('pointermove', e => {
        const pt = P1.svgPoint(e);
        if (dragK !== -1) dragTo(pt);
        else svgPmf.style.cursor = slotAt(pt) === -1 ? '' : 'ns-resize';
    });
    const end = () => { if (dragK !== -1) { dragK = -1; draw(); } };
    svgPmf.addEventListener('pointerup', end);
    svgPmf.addEventListener('pointercancel', end);

    // ---- controls ----

    slider.addEventListener('input', draw);
    preset?.addEventListener('change', () => {
        if (PRESETS[preset.value]) { base = normalize(PRESETS[preset.value]); draw(); }
    });
    const unshuffle = document.getElementById('de-a-unshuffle');
    const setOrder = next => {
        next.forEach((k, j) => { order[j] = k; });
        if (unshuffle) unshuffle.disabled = order.every((k, j) => k === j);
        draw();
    };
    document.getElementById('de-a-shuffle')?.addEventListener('click', () => {
        const next = order.slice();
        for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [next[i], next[j]] = [next[j], next[i]];
        }
        setOrder(next);
    });
    unshuffle?.addEventListener('click', () => setOrder(order.map((_, j) => j)));
    draw();
}
