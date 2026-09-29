// ================================================================
//  The same recipe with a density: f(x) with the f > 1 mass marked,
//  and -log2 f(x) drawn against u = F(x), so h is the net area.
//  The density is editable: drag its handles, rescale it with σ, or
//  reset it to a family preset.
// ================================================================

import { log2, densityPts, sampleXs, familyShape, shapeDist, shapeMoments } from './dist.js';
import { Plot, txt } from './svgplot.js';
import { fmt, setSigned, setText } from './ui.js';
import { createDensityEditor } from './density-edit.js';
import { bindShapeControls, shapeWindow, growWindow } from './shape-controls.js';

export function initDensity() {
    const svgPdf = document.getElementById('de-b-pdf');
    const svgArea = document.getElementById('de-b-area');
    const slider = document.getElementById('de-b-sd');
    if (!svgPdf || !svgArea || !slider) return;
    const P1 = new Plot(svgPdf, { w: 520, h: 320 });
    const P2 = new Plot(svgArea, { w: 520, h: 320 });
    let shape = familyShape('gauss', 2 ** (+slider.value));
    let win = null; // data window of the density panel, held fixed during a drag

    const controls = bindShapeControls({
        slider, label: document.getElementById('de-b-sdv'), famGroup: document.getElementById('de-b-fam'),
        get: () => shape, set: s => { shape = s; draw(); },
    });
    const editor = createDensityEditor(P1, {
        getShape: () => shape,
        setShape: s => { shape = s; draw(); },
        onEnd: () => draw(),
    });

    function draw() {
        const d = shapeDist(shape);
        const { mean } = shapeMoments(shape);
        if (!editor.dragging || !win) win = shapeWindow(shape, d, 1.35);
        else growWindow(win, shape, d);
        controls.sync();

        P1.domain(win.x0, win.x1, 0, win.y1);
        P1.axes({ nx: 6, ny: 5, xlabel: 'x', ylabel: 'f(x)' });
        const pts = densityPts(d, win.x0, win.x1, 600);
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
            if (start !== null) flush(win.x1);
        }
        P1.path(pts, 'curve');
        P1.hline(1, 'ref');
        txt(P1.front, P1.pr - 4, P1.Y(1) - 6, 'f = 1', 'lbl soft', { 'text-anchor': 'end' });
        const eff = 2 ** d.h;
        P1.rect(mean - eff / 2, 0, mean + eff / 2, 1 / eff, 'eqbox');
        editor.draw(d);

        P2.domain(0, 1, -5, 9);
        P2.axes({
            xticks: [0, .25, .5, .75, 1], yticks: [-4, -2, 0, 2, 4, 6, 8],
            xlabel: 'cumulative probability u = F(x)', ylabel: '−log₂ f(x)',
        });
        let mp;
        if (d.kind === 'unif') mp = [[0, d.h], [1, d.h]];
        else {
            mp = [];
            for (const x of sampleXs(d.comps, d.lo, d.hi, 1200)) {
                const f = d.pdf(x);
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

    draw();
}
