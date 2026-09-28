// ================================================================
//  Stretching the axis: atoms at a·x_i keep their heights, while the
//  density of aX flattens by 1/a so that its area stays 1.
// ================================================================

import { family, shannonH, quantile } from './dist.js';
import { Plot, txt } from './svgplot.js';
import { fmt, setSigned, setText, MINUS } from './ui.js';

const XS = [-0.75, -0.3, 0.1, 0.45, 0.8];
const PS = [0.15, 0.3, 0.25, 0.2, 0.1];

export function initStretch() {
    const svgDisc = document.getElementById('de-d-disc');
    const svgCont = document.getElementById('de-d-cont');
    const slider = document.getElementById('de-d-a');
    if (!svgDisc || !svgCont || !slider) return;
    const Hd = shannonH(PS);
    const base = family('bimodal', 0.5);
    const q25 = quantile(base, 0.25), q75 = quantile(base, 0.75);
    const P1 = new Plot(svgDisc, { w: 520, h: 300 });
    const P2 = new Plot(svgCont, { w: 520, h: 300 });

    function draw() {
        const la = +slider.value, a = 2 ** la;
        setText(document.getElementById('de-d-av'), a >= 1
            ? String(+a.toPrecision(3))
            : (Math.abs(la - Math.round(la)) < 1e-9 ? '1/' + (2 ** -Math.round(la)) : a.toPrecision(2)));
        const moved = Math.abs(a - 1) > 1e-6;

        // discrete
        P1.domain(-7, 7, 0, 0.42);
        P1.axes({ xticks: [-6, -4, -2, 0, 2, 4, 6], yticks: [0, .1, .2, .3, .4], xlabel: 'a·x', ylabel: 'p' });
        XS.forEach((x, i) => {
            if (moved) { P1.line(x, 0, x, PS[i], 'stem ghost'); P1.circle(x, PS[i], 3.5, 'dot ghost'); }
            P1.line(a * x, 0, a * x, PS[i], 'stem');
            P1.circle(a * x, PS[i], 4.5, 'dot');
        });
        txt(P1.front, P1.pr - 4, P1.pt + 14, 'heights unchanged: H = ' + Hd.toFixed(2) + ' bits', 'lbl atom b', { 'text-anchor': 'end' });

        // continuous
        const ymax = 3.2;
        P2.domain(-7, 7, 0, ymax);
        P2.axes({ xticks: [-6, -4, -2, 0, 2, 4, 6], yticks: [0, 1, 2, 3], xlabel: 'y = a x', ylabel: 'f(y)' });
        const fy = y => base.pdf(y / a) / a;
        const N = 900, pts = [], band = [], ghost = [];
        for (let i = 0; i <= N; i++) {
            const y = -7 + 14 * i / N, v = fy(y);
            pts.push([y, v]);
            ghost.push([y, base.pdf(y)]);
            if (y >= a * q25 && y <= a * q75) band.push([y, v]);
        }
        P2.area(pts, 'fm');
        P2.area([[a * q25, fy(a * q25)], ...band, [a * q75, fy(a * q75)]], 'band');
        if (moved) P2.path(ghost, 'curve ghost');
        P2.path(pts, 'curve');
        P2.hline(1, 'ref');
        const hY = base.h + la, eff = 2 ** hY;
        P2.rect(-eff / 2, 0, eff / 2, 1 / eff, 'eqbox');
        const pk = base.peak / a;
        if (pk > ymax) txt(P2.front, P2.X(0), P2.pt + 12, 'peak ' + pk.toFixed(1) + ' (off the chart)', 'lbl soft', { 'text-anchor': 'middle' });
        txt(P2.front, P2.pr - 4, P2.pt + (pk > ymax ? 28 : 14), 'ochre area = 0.5 at every a', 'lbl atom', { 'text-anchor': 'end' });

        setText(document.getElementById('de-d-H'), Hd.toFixed(3));
        setText(document.getElementById('de-d-hx'), fmt(base.h, 3));
        setText(document.getElementById('de-d-la'), (la >= 0 ? '+ ' : MINUS + ' ') + Math.abs(la).toFixed(2));
        setSigned(document.getElementById('de-d-h'), hY, 3);
    }

    slider.addEventListener('input', draw);
    draw();
}
