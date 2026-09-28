// ================================================================
//  Discrete entropy as area: an 8-outcome softmax pmf, and the same
//  pmf as columns of width p(x) and height -log2 p(x).
// ================================================================

import { log2, softmax, shannonH } from './dist.js';
import { Plot, txt } from './svgplot.js';
import { setText } from './ui.js';

const LOGITS = [1.9, 0.2, 1.1, -0.6, 0.7, -1.3, 0.1, -0.3];
const NAMES = 'abcdefgh'.split('');

export function initDiscrete() {
    const svgPmf = document.getElementById('de-a-pmf');
    const svgArea = document.getElementById('de-a-area');
    const slider = document.getElementById('de-a-beta');
    if (!svgPmf || !svgArea || !slider) return;
    const P1 = new Plot(svgPmf, { w: 520, h: 300 });
    const P2 = new Plot(svgArea, { w: 520, h: 300 });
    const order = LOGITS.map((_, i) => i);

    function draw() {
        const beta = +slider.value;
        setText(document.getElementById('de-a-betav'), beta.toFixed(2));
        const p = softmax(LOGITS, beta);
        const H = shannonH(p);

        P1.domain(0.4, 8.6, 0, 1.12);
        P1.axes({ xticks: [], yticks: [0, .25, .5, .75, 1], ylabel: 'p(x)' });
        order.forEach((k, j) => {
            P1.rect(j + 1 - .32, 0, j + 1 + .32, p[k], 'bar');
            txt(P1.back, P1.X(j + 1), P1.pb + 16, NAMES[k], 'axl', { 'text-anchor': 'middle' });
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
    }

    slider.addEventListener('input', draw);
    document.getElementById('de-a-shuffle')?.addEventListener('click', () => {
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        draw();
    });
    draw();
}
