// ================================================================
//  Probability model shared by figures: the case, the distribution
//  (an editable pmf on 1..8, or an editable density shape), its
//  samples, and the plotting window. Pure: no DOM.
// ================================================================

import { withMass, shapeMoments, cdfOf, sampleShape, atU, lerp } from './dist.js';

const norm = p => { const Z = p.reduce((a, b) => a + b, 0); return p.map(v => v / Z); };
const SNAP_P = 0.03; // a dragged probability below this pops to zero

export const DISC_PRESETS = {
    uniform: { label: 'uniform', p: norm([1, 1, 1, 1, 1, 1, 1, 1]) },
    zipf:    { label: 'zipf', p: norm([1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]) },
    onehot:  { label: 'one-hot', p: [0, 0, 1, 0, 0, 0, 0, 0] },
};
export const CONT_PRESETS = {
    gauss:   { label: 'Gaussian', shape: { kind: 'mix', comps: [{ w: 1, m: 0, s: 0.2 }] } },
    bimodal: { label: 'Bimodal', shape: { kind: 'mix', comps: [{ w: .62, m: -.35, s: .13 }, { w: .38, m: .4, s: .2 }] } },
    steps:   { label: 'Steps', shape: { kind: 'steps', ts: [-.55, -.3, -.1, .1, .3, .55], ms: [.1, .28, .34, .18, .1] } },
    uniform: { label: 'Uniform', shape: { kind: 'steps', ts: [-0.35, 0.35], ms: [1] } },
};

// Plot window for a shape: its ±4.2σ, widened to each component's ±4σ or past
// the outer step points, with room above f = 1 and above the peak.
function fitWindow(shape, peak) {
    const { mean, sd } = shapeMoments(shape);
    let x0 = mean - 4.2 * sd, x1 = mean + 4.2 * sd;
    if (shape.kind === 'mix') {
        for (const c of shape.comps) { x0 = Math.min(x0, c.m - 4 * c.s); x1 = Math.max(x1, c.m + 4 * c.s); }
    } else {
        const a = shape.ts[0], b = shape.ts[shape.ts.length - 1], pad = 0.15 * (b - a);
        x0 = Math.min(x0, a - pad); x1 = Math.max(x1, b + pad);
    }
    return { x0, x1, y1: Math.max(1.1, peak * 1.12) };
}

// While a drag is live the window only grows: upward when the peak presses the
// top, sideways when the shape presses an edge or more than 0.1% of the mass
// lies past one (so every panel, and the map's lines, stay on the distribution).
function growWindow(win, shape, peak, S) {
    if (peak > 0.92 * win.y1) win.y1 = peak * 1.15;
    const span = win.x1 - win.x0, edge = 0.04 * span;
    const xs = shape.kind === 'steps' ? shape.ts : shape.comps.map(c => c.m);
    if (Math.min(...xs) < win.x0 + edge) win.x0 -= 0.1 * span;
    if (Math.max(...xs) > win.x1 - edge) win.x1 += 0.1 * span;
    const lo = lerp(S.xs, atU(S, 0.001)), hi = lerp(S.xs, atU(S, 0.999));
    if (lo < win.x0) win.x0 = lo - 0.05 * span;
    if (hi > win.x1) win.x1 = hi + 0.05 * span;
}

export function createModel() {
    const subs = [];
    let S = null, win = null, held = false, customP = null; // customP: the last edited pmf
    const m = {
        kase: 'disc', discKey: 'zipf', contKey: 'gauss',
        p: DISC_PRESETS.zipf.p.slice(),
        shape: structuredClone(CONT_PRESETS.gauss.shape),
    };
    const resample = () => {
        S = sampleShape(m.shape);
        if (held && win) growWindow(win, m.shape, S.peak, S); else win = fitWindow(m.shape, S.peak);
    };
    const changed = () => subs.forEach(f => f());
    resample();

    m.subscribe = fn => { subs.push(fn); };
    // Back to the state a new model starts in: discrete zipf, the Gaussian, no edits kept,
    // the window refitted.
    m.reset = () => {
        Object.assign(m, { kase: 'disc', discKey: 'zipf', contKey: 'gauss', p: DISC_PRESETS.zipf.p.slice(), shape: structuredClone(CONT_PRESETS.gauss.shape) });
        customP = null; held = false; win = null;
        resample(); changed();
    };
    m.setCase = k => { m.kase = k; changed(); };
    m.setPreset = key => {
        if (m.kase === 'disc') {
            m.discKey = key;
            if (key !== 'custom') m.p = DISC_PRESETS[key].p.slice(); else if (customP) m.p = customP.slice();
        }
        else { m.contKey = key; m.shape = structuredClone(CONT_PRESETS[key].shape); resample(); }
        changed();
    };
    m.editPmf = (i, target) => { m.p = withMass(m.p, i, target, SNAP_P); customP = m.p.slice(); m.discKey = 'custom'; changed(); };
    m.setShape = shape => { m.shape = shape; m.contKey = 'custom'; resample(); changed(); };
    // While held (a drag is live) the window only grows; it stays put on release, and
    // refits only when a preset is chosen, so the axes never jump under an edit.
    m.hold = on => { held = on; };
    m.view = () => m.kase === 'disc'
        ? { disc: true, p: m.p, F: cdfOf(m.p), n: m.p.length, xRange: [0.5, m.p.length + 0.5] }
        : { disc: false, shape: m.shape, S, win, xRange: [win.x0, win.x1] };
    return m;
}
