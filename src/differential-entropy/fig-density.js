// ================================================================
//  The same recipe with a density: f(x) with the f > 1 mass marked,
//  and -log2 f(x) drawn against u = F(x), so h is the net area.
// ================================================================

import { log2, family, densityPts } from './dist.js';
import { Plot, txt } from './svgplot.js';
import { fmt, setSigned, setText, powLabel, segButtons } from './ui.js';

export function initDensity() {
    const svgPdf = document.getElementById('de-b-pdf');
    const svgArea = document.getElementById('de-b-area');
    const slider = document.getElementById('de-b-sd');
    if (!svgPdf || !svgArea || !slider) return;
    const P1 = new Plot(svgPdf, { w: 520, h: 320 });
    const P2 = new Plot(svgArea, { w: 520, h: 320 });
    let fam = 'gauss';

    function draw() {
        const sd = 2 ** (+slider.value);
        setText(document.getElementById('de-b-sdv'), powLabel(sd));
        const d = family(fam, sd);

        const xr = 4.2 * sd, ymax = Math.max(1.35, d.peak * 1.12);
        P1.domain(-xr, xr, 0, ymax);
        P1.axes({ nx: 6, ny: 5, xlabel: 'x', ylabel: 'f(x)' });
        const pts = densityPts(d, -xr, xr, 600);
        P1.area(pts, 'fm');
        // shade (and total) the mass where f > 1
        let pneg = 0;
        if (d.kind === 'unif') {
            if (d.peak > 1) { P1.rect(d.a, 0, d.b, d.peak, 'fn'); pneg = 1; }
        } else {
            let seg = [], start = null;
            const flush = end => {
                if (seg.length > 1) { P1.area(seg, 'fn'); pneg += d.cdf(end) - d.cdf(start); }
                seg = []; start = null;
            };
            for (const pt of pts) {
                if (pt[1] > 1) { if (start === null) start = pt[0]; seg.push(pt); }
                else if (start !== null) flush(pt[0]);
            }
            if (start !== null) flush(xr);
        }
        P1.path(pts, 'curve');
        P1.hline(1, 'ref');
        txt(P1.front, P1.pr - 4, P1.Y(1) - 6, 'f = 1', 'lbl soft', { 'text-anchor': 'end' });
        const eff = 2 ** d.h;
        P1.rect(-eff / 2, 0, eff / 2, 1 / eff, 'eqbox');

        P2.domain(0, 1, -5, 9);
        P2.axes({
            xticks: [0, .25, .5, .75, 1], yticks: [-4, -2, 0, 2, 4, 6, 8],
            xlabel: 'cumulative probability u = F(x)', ylabel: '−log₂ f(x)',
        });
        let mp;
        if (d.kind === 'unif') mp = [[0, d.h], [1, d.h]];
        else {
            mp = [];
            for (let i = 0; i <= 1200; i++) {
                const x = d.lo + (d.hi - d.lo) * i / 1200, f = d.pdf(x);
                if (f > 1e-300) mp.push([d.cdf(x), -log2(f)]);
            }
        }
        P2.area(mp, 'fm', P2.gAbove());
        P2.area(mp, 'fn', P2.gBelow());
        P2.path(mp, 'curve');
        P2.hline(d.h, 'hmark');
        const lblY = d.h > 7.5 ? P2.Y(d.h) + 16 : P2.Y(d.h) - 7;
        txt(P2.front, P2.pr - 4, lblY, 'h = net area = ' + fmt(d.h), 'lbl b', { 'text-anchor': 'end' });

        setSigned(document.getElementById('de-b-h'), d.h, 3);
        setText(document.getElementById('de-b-peak'), d.peak.toFixed(2));
        setText(document.getElementById('de-b-pneg'), pneg.toFixed(2));
        setText(document.getElementById('de-b-eff'), String(+eff.toPrecision(3)));
    }

    segButtons(document.getElementById('de-b-fam'), v => { fam = v; draw(); });
    slider.addEventListener('input', draw);
    draw();
}
