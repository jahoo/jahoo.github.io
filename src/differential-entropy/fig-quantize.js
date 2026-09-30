// ================================================================
//  Quantize, then subtract: H(X_Δ) against log2(1/Δ), its small-Δ
//  asymptote h + log2(1/Δ), and the histogram at the current Δ.
// ================================================================

import { densityPts, binRange, quantH, familyShape, shapeDist, shapeMoments } from '../lib/prob/dist.js';
import { Plot, el, txt } from './svgplot.js';
import { fmt, setSigned, setText } from './ui.js';
import { createDensityEditor } from './density-edit.js';
import { bindShapeControls, shapeWindow, growWindow } from './shape-controls.js';

const T_MIN = -3, T_MAX = 12; // range of log2(1/Δ)

// Δ = 2^-t as "1/2^k", an integer, or ≤ 3 significant figures.
function deltaLabel(t) {
    if (Math.abs(t - Math.round(t)) < 1e-9) {
        const k = Math.round(t);
        return k > 0 ? '1/' + (2 ** k) : String(2 ** (-k));
    }
    const D = 2 ** (-t);
    return D < 0.01 ? D.toExponential(2) : String(+D.toPrecision(3));
}

export function initQuantize() {
    const svgCurve = document.getElementById('de-c-curve');
    const svgPdf = document.getElementById('de-c-pdf');
    const sS = document.getElementById('de-c-sd');
    const sD = document.getElementById('de-c-d');
    if (!svgCurve || !svgPdf || !sS || !sD) return;
    const P1 = new Plot(svgCurve, { w: 600, h: 380, m: { l: 48, r: 16, t: 14, b: 42 } });
    const P2 = new Plot(svgPdf, { w: 440, h: 380, m: { l: 44, r: 12, t: 14, b: 42 } });
    let shape = familyShape('gauss', 2 ** (+sS.value));
    let win = null; // data window of the density panel, held fixed during a drag
    let cacheKey = '', curve = null; // H(X_Δ) over the whole Δ range depends only on the distribution

    const controls = bindShapeControls({
        slider: sS, label: document.getElementById('de-c-sdv'), famGroup: document.getElementById('de-c-fam'),
        get: () => shape, set: s => { shape = s; draw(); },
    });
    const editor = createDensityEditor(P2, {
        getShape: () => shape,
        setShape: s => { shape = s; draw(); },
        onEnd: () => draw(),
    });

    function draw() {
        const t = +sD.value, D = 2 ** (-t);
        setText(document.getElementById('de-c-dv'), deltaLabel(t));
        const d = shapeDist(shape);
        controls.sync();
        // coarser curve while dragging, full resolution once released
        const key = JSON.stringify(shape) + (editor.dragging ? '|drag' : '');
        if (key !== cacheKey) {
            cacheKey = key;
            curve = [];
            const step = editor.dragging ? 0.25 : 0.0625;
            for (let tt = T_MIN; tt <= T_MAX + 1e-4; tt += step) {
                const DD = 2 ** (-tt);
                curve.push([tt, DD < d.minScale / 64 ? d.h + tt : quantH(d, DD)]);
            }
        }
        const Hq = quantH(d, D);

        // left: the curve and its asymptote
        P1.domain(T_MIN, T_MAX, -7, 16);
        P1.axes({
            xticks: [-3, -2, -1, 0, 2, 4, 6, 8, 10, 12],
            yticks: [-6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16],
            xlabel: 'log₂(1/Δ)   (finer bins →)', ylabel: 'bits',
        });
        P1.rect(T_MIN, -7, T_MAX, 0, 'negzone');
        txt(P1.data, P1.X(11.8), P1.Y(-6.3), 'no discrete entropy is ever down here', 'lbl neg', { 'text-anchor': 'end' });
        P1.path(curve, 'qcurve');
        P1.path([[T_MIN, d.h + T_MIN], [T_MAX, d.h + T_MAX]], 'asym');
        const yA = d.h + t;
        if (Math.abs(Hq - yA) > 0.02) P1.line(t, yA, t, Hq, 'gap');
        P1.circle(0, d.h, 5.5, 'ptm', P1.front);
        if (d.h < 0) txt(P1.front, P1.X(0) + 9, P1.Y(d.h) + 17, 'h(X) = ' + fmt(d.h), 'lbl mass b', {});
        else txt(P1.front, P1.X(0) - 9, P1.Y(d.h) + (d.h > 13 ? 18 : -9), 'h(X) = ' + fmt(d.h), 'lbl mass b', { 'text-anchor': 'end' });
        P1.circle(t, Hq, 6, 'pt', P1.front);
        const anchorEnd = t > 6;
        const hl = txt(P1.front, P1.X(t) + (anchorEnd ? -10 : 10), P1.Y(Hq) + (Hq > yA ? -10 : 16), 'H(X',
            'lbl atom b', { 'text-anchor': anchorEnd ? 'end' : 'start' });
        el('tspan', { 'baseline-shift': 'sub', 'font-size': '9' }, hl).textContent = 'Δ';
        el('tspan', null, hl).textContent = ') = ' + Hq.toFixed(2);
        const yEnd = d.h + 11.9;
        txt(P1.front, P1.X(11.9), P1.Y(Math.min(15.2, yEnd)) + (yEnd > 15.2 ? 14 : -8), 'h(X) + log₂(1/Δ)', 'lbl mass', { 'text-anchor': 'end' });

        // right: density and histogram (bar height p_i / Δ)
        if (!editor.dragging || !win) {
            win = shapeWindow(shape, d, 1.2);
            const { mean } = shapeMoments(shape), half = Math.max((win.x1 - win.x0) / 2, 0.75 * D);
            win.x0 = Math.min(win.x0, mean - half); win.x1 = Math.max(win.x1, mean + half);
        } else growWindow(win, shape, d);
        const [k0, k1] = binRange(d, D);
        const kv0 = Math.max(k0, Math.floor(win.x0 / D - 1)), kv1 = Math.min(k1, Math.ceil(win.x1 / D + 1));
        const drawBars = (kv1 - kv0) <= 360;
        let barMax = 0;
        const bars = [];
        if (drawBars) for (let k = kv0; k <= kv1; k++) {
            const hgt = d.mass((k - .5) * D, (k + .5) * D) / D;
            bars.push([k, hgt]);
            barMax = Math.max(barMax, hgt);
        }
        if (!editor.dragging) win.y1 = Math.max(win.y1, barMax * 1.05);
        P2.domain(win.x0, win.x1, 0, win.y1);
        P2.axes({ nx: 5, ny: 5, xlabel: 'x', ylabel: 'density' });
        for (const [k, hgt] of bars) if (hgt > 0) P2.rect((k - .5) * D, 0, (k + .5) * D, hgt, 'bar');
        const pts = densityPts(d, win.x0, win.x1, 500);
        P2.area(pts, 'fm');
        P2.path(pts, 'curve');
        P2.hline(1, 'ref');
        editor.draw(d);
        if (!drawBars) txt(P2.front, P2.pl + 8, P2.pt + 16, 'bins are finer than the plot can show', 'lbl soft', {});

        setText(document.getElementById('de-c-H'), Hq.toFixed(3));
        setText(document.getElementById('de-c-L'), fmt(t, 2));
        setSigned(document.getElementById('de-c-diff'), Hq - t, 3);
        setSigned(document.getElementById('de-c-h'), d.h, 3);
    }

    sD.addEventListener('input', draw);
    draw();
}
