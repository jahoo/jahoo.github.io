// ================================================================
//  Opening figure: uniform density on [0, w], draggable right edge.
//  h = log2 w, negative whenever the box is narrower than one unit.
// ================================================================

import { log2, clamp } from './dist.js';
import { Plot, el, txt } from './svgplot.js';
import { fmt, setText } from './ui.js';

export function initUniform() {
    const svg = document.getElementById('de-uni-svg');
    const slider = document.getElementById('de-uni-w');
    if (!svg || !slider) return;
    const out = document.getElementById('de-uni-h');
    const P = new Plot(svg, { w: 620, h: 300, m: { l: 42, r: 16, t: 14, b: 40 } });
    let w = +slider.value, dragging = false;

    function draw() {
        P.domain(-0.15, 4.3, 0, 5.4);
        P.axes({ xticks: [0, 1, 2, 3, 4], yticks: [0, 1, 2, 3, 4, 5], xlabel: 'x', ylabel: 'f(x)' });
        const ht = 1 / w;
        P.rect(0, 0, w, ht, w < 1 ? 'fnb' : 'fmb');
        P.line(0, 1, 4.3, 1, 'ref');
        txt(P.front, P.X(4.25), P.Y(1) - 6, 'f = 1', 'lbl soft', { 'text-anchor': 'end' });
        P.rect(0, 0, 1, 1, 'eqbox');
        if (w >= 0.7) txt(P.front, P.X(0.5), P.Y(0) - 6, 'unit square', 'lbl soft', { 'text-anchor': 'middle' });
        el('line', { x1: P.X(w), x2: P.X(w), y1: P.Y(0), y2: P.Y(ht), class: 'edge' }, P.front);
        el('circle', { cx: P.X(w), cy: P.Y(Math.min(ht, 5.4) / 2), r: 7, class: 'handle' }, P.front);
        txt(P.front, P.X(w) + 12, P.Y(Math.min(ht, 5.2)) + 14, 'height 1/w = ' + (1 / w).toFixed(2), 'lbl', {});
        setText(document.getElementById('de-uni-wv'), w.toFixed(2));
        const h = log2(w);
        setText(out, 'h = ' + fmt(h) + ' bits');
        out?.classList.toggle('neg', h < -0.005);
    }

    function move(e) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        w = clamp(P.invX(p.x), +slider.min, +slider.max);
        slider.value = w;
        draw();
    }

    svg.addEventListener('pointerdown', e => { dragging = true; svg.setPointerCapture(e.pointerId); move(e); });
    svg.addEventListener('pointermove', e => { if (dragging) move(e); });
    svg.addEventListener('pointerup', () => { dragging = false; });
    svg.addEventListener('pointercancel', () => { dragging = false; });
    slider.addEventListener('input', () => { w = +slider.value; draw(); });
    draw();
}
