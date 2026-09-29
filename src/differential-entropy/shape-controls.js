// ================================================================
//  Differential entropy — shape-controls.js
//  The controls shared by the editable-density figures: a σ slider
//  (log2 scale) that rescales the current shape about its mean, and
//  family buttons that reset it to a preset at the current σ.
// ================================================================

import { log2, clamp, familyShape, shapeMoments, rescaleShape } from './dist.js';
import { powLabel, segButtons } from './ui.js';

// opts: { slider, label, famGroup, get(), set(shape) }
// Returns { sync() }: call on every redraw so the slider and its label
// follow the shape's actual standard deviation after a drag.
export function bindShapeControls(opts) {
    const { slider, label, famGroup } = opts;
    let sliding = false; // the slider itself caused this redraw: leave its value alone
    slider.addEventListener('input', () => {
        sliding = true;
        opts.set(rescaleShape(opts.get(), 2 ** (+slider.value)));
        sliding = false;
    });
    segButtons(famGroup, name => {
        opts.set(familyShape(name, shapeMoments(opts.get()).sd));
    });
    return {
        sync() {
            const { sd } = shapeMoments(opts.get());
            if (label) label.textContent = powLabel(sd);
            if (!sliding) slider.value = String(clamp(log2(sd), +slider.min, +slider.max));
        },
    };
}

// Data window for plotting a shape: every component's ±4σ and the whole
// shape's ±4.2σ (the uniform needs no more), with y room above f = 1 and
// above the peak.
export function shapeWindow(shape, d, yFloor) {
    const { mean, sd } = shapeMoments(shape);
    let x0 = mean - 4.2 * sd, x1 = mean + 4.2 * sd;
    if (shape.kind === 'mix') {
        for (const c of shape.comps) { x0 = Math.min(x0, c.m - 4 * c.s); x1 = Math.max(x1, c.m + 4 * c.s); }
    }
    return { x0, x1, y1: Math.max(yFloor, d.peak * 1.12) };
}

// During a drag the window is held fixed, except that it grows (never
// shrinks) when the dragged shape presses against its top or sides, so a
// peak can be pushed past the current top in one gesture.
export function growWindow(win, shape, d) {
    if (d.peak > 0.92 * win.y1) win.y1 = d.peak * 1.15;
    const span = win.x1 - win.x0, edge = 0.04 * span;
    const xs = shape.kind === 'unif' ? [shape.a, shape.b] : shape.comps.map(c => c.m);
    if (Math.min(...xs) < win.x0 + edge) win.x0 -= 0.1 * span;
    if (Math.max(...xs) > win.x1 - edge) win.x1 += 0.1 * span;
}
