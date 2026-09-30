// ================================================================
//  The (x, u) position shared by figures. Whichever of x, u was set
//  last drives: u = F_X(x) (right-continuous) or x = F_X⁻¹(u)
//  (generalized inverse). Pure: no DOM.
// ================================================================

import { clamp, discCdfAt, discQuantile, atX, atU, lerp } from './dist.js';

export function createPosition(model) {
    const pos = { x: 0, u: 0, driver: 'x' };
    const fromX = () => {
        const v = model.view(), [a, b] = v.xRange;
        pos.x = clamp(pos.x, a, b);
        if (v.disc) { pos.u = discCdfAt(v.F, pos.x); return; }
        // at the ends of the plotted range (or past the samples, which cover the support)
        // all or none of the probability lies to the left
        const xs = v.S.xs;
        if (pos.x >= Math.min(b, xs[xs.length - 1]) - 1e-12) pos.u = 1;
        else if (pos.x <= Math.max(a, xs[0]) + 1e-12) pos.u = 0;
        else pos.u = lerp(v.S.Fs, atX(v.S, pos.x));
    };
    const fromU = () => {
        const v = model.view();
        pos.u = clamp(pos.u, 0, 1);
        if (v.disc) { const k = discQuantile(v.F, pos.u); pos.x = k === 0 ? 0.5 : k; }
        else pos.x = clamp(lerp(v.S.xs, atU(v.S, pos.u)), v.xRange[0], v.xRange[1]);
    };
    pos.setX = x => { pos.driver = 'x'; pos.x = x; fromX(); };
    pos.setU = u => { pos.driver = 'u'; pos.u = u; fromU(); };
    // After a model change: keep the driving coordinate, recompute the other.
    pos.refresh = () => (pos.driver === 'x' ? fromX() : fromU());
    pos.setX(4.1);
    return pos;
}
