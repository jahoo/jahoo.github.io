// ================================================================
//  The fixed, annotated figure: a hand-picked run (memoryless prior,
//  s = 0.9, M = 16, seed 12) rendered with callouts computed from the
//  run data itself. Top: prior targets; bottom: proposal targets,
//  same randomness. Annotations live in widened top/bottom margins
//  and use warm-orange curved arrows + rings, so they cannot be
//  confused with the gray genealogy connectors.
// ================================================================

import { runOne } from './simulate.js';
import { UNIFORM } from './model.js';
import { drawRun, label, curveArrow, ring } from './draw-trajectories.js';

export const FIXED = { P: UNIFORM, s: 0.9, M: 16, seed: 826 };
const PADS = { padT: 42, padB: 32 };
const ANNO = '#c26d21';

function clampX(ctx, text, tx, wCss) {
    const half = ctx.measureText(text).width / 2 + 4;
    return Math.min(Math.max(tx, half), wCss - half);
}

export function renderAnnotated(els) {
    const { P, s, M, seed } = FIXED;
    const pt = runOne(P, s, 'PT', M, seed);
    const qt = runOne(P, s, 'QT', M, seed);
    const e = pt.events[0];
    const st = pt.steps[e.afterT];
    const chosen = new Set(e.anc);
    const killed = e.pool.filter(m => !chosen.has(m) && st.phase[m] <= 1);
    // the cloned ancestor = the chosen slot with the greatest depth
    const anc = [...chosen].sort((a, b) => st.depth[b] - st.depth[a])[0];
    const nClones = e.anc.filter(a => a === anc).length;

    const T = Math.max(pt.steps.length, qt.steps.length);
    drawRun(els.cvA1, pt, M, 'SMC, prior targets — a hand-picked run', {
        ...PADS, T,
        annotate: ({ ctx, X, laneY, geom }) => {
            const cx = geom.cutX(e.afterT);
            // clone callout: label in the top margin, curved arrow to the ancestor band
            const t1 = `deep = heavy: cloned ×${nClones}`;
            const tx1 = clampX(ctx, t1, cx + 90, geom.wCss);
            label(ctx, t1, tx1, 36);
            curveArrow(ctx, tx1 - 30, 40, X(e.afterT) + geom.bandW - 3, laneY(anc) - 5, ANNO, -1);
            // kills: rings on each ×, label in the bottom margin, one arrow to the nearest
            killed.forEach(m => ring(ctx, cx, laneY(m), 7, ANNO));
            const lowest = killed.reduce((a, b) => (laneY(a) > laneY(b) ? a : b));
            const t2 = `shallow = light: ${killed.length} killed, about to finish`;
            const tx2 = clampX(ctx, t2, cx + 120, geom.wCss);
            label(ctx, t2, tx2, geom.hCss - 8);
            curveArrow(ctx, tx2 - 40, geom.hCss - 18, cx + 6, laneY(lowest) + 6, ANNO, 1);
        },
    });

    // in the QT run the killed slots evolve under the same randomness
    const fates = killed.map(m => {
        for (let t = e.afterT; t < qt.steps.length; t++) {
            if (qt.steps[t].phase[m] === 3) return { m, t, valid: qt.steps[t].w[m] > 0 };
        }
        return null;
    }).filter(Boolean);
    const qe = qt.events[0];
    drawRun(els.cvA2, qt, M, 'SMC, proposal targets — same randomness', {
        ...PADS, T,
        annotate: ({ ctx, X, laneY, geom }) => {
            const gx = t => X(t) + geom.bandW * 0.5;   // ¤ glyph position
            if (fates.length) {
                fates.forEach(f => ring(ctx, gx(f.t), laneY(f.m), 8, ANNO));
                const top = fates.reduce((a, b) => (laneY(a.m) < laneY(b.m) ? a : b));
                const t3 = `the same ${fates.length} particles, left alone: all finish validly`;
                const tx3 = clampX(ctx, t3, gx(top.t) + 60, geom.wCss);
                label(ctx, t3, tx3, 36);
                curveArrow(ctx, tx3 - 50, 40, gx(top.t) + 6, laneY(top.m) - 8, ANNO, -1);
            }
            if (qe) {
                const qx = geom.cutX(qe.afterT);
                const t4 = 'fires only to recycle dead slots';
                const tx4 = clampX(ctx, t4, qx, geom.wCss);
                label(ctx, t4, tx4, geom.hCss - 8);
                curveArrow(ctx, tx4, geom.hCss - 18, qx, geom.hCss - geom.padB - 2, ANNO, 1);
            }
        },
    });
}
