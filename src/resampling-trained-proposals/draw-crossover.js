// ================================================================
//  Panel 2: the crossover. Relative std of Zhat vs training progress s.
//  SIS drawn exactly (DP); the two SMC arms by Monte Carlo with ±1 SE
//  bars, computed asynchronously so the page stays responsive.
// ================================================================

import { analyticSisRelstd } from './model.js';
import { crossoverPoint } from './simulate.js';
import { COL, S_GRID_MC, setupCanvas } from './config.js';

let runToken = 0;   // cancels stale async computations
let cache = null;   // last drawn data, for cheap marker-only redraws

export async function renderCrossover(state, els) {
    const token = ++runToken;
    const { P, M } = state;
    const R = state.R;
    // exact SIS curve on a fine grid
    const sisGrid = [];
    for (let s = 0; s <= 1.0001; s += 0.02) sisGrid.push([s, analyticSisRelstd(P, s, M)]);
    const pts = { PT: [], QT: [] };
    cache = { sisGrid, pts };
    draw(els.cvX, sisGrid, pts, state.s);
    els.progress.textContent = 'computing…';
    for (const s of S_GRID_MC) {
        for (const arm of ['PT', 'QT']) {
            await new Promise(r => setTimeout(r, 0));
            if (token !== runToken) return;              // superseded
            const p = crossoverPoint(P, s, arm, M, R, 1000 + Math.round(s * 1e4));
            pts[arm].push({ s, ...p });
            draw(els.cvX, sisGrid, pts, state.s);
        }
    }
    if (token === runToken) els.progress.textContent = `M = ${M}, ${R} runs per point, ±1 SE`;
}

// Redraw from cached data (e.g., when the s slider moves) without recomputing.
export function redrawCrossover(state, els) {
    if (cache) draw(els.cvX, cache.sisGrid, cache.pts, state.s);
}

function draw(canvas, sisGrid, pts, sMark) {
    const wCss = canvas.parentElement.clientWidth;
    const hCss = parseInt(canvas.dataset.h || '280', 10);
    const ctx = setupCanvas(canvas, wCss, hCss);
    const padL = 44, padR = 10, padT = 14, padB = 30;
    const ymax = Math.max(...sisGrid.map(p => p[1]),
        ...pts.PT.map(p => p.relstd), 0.1) * 1.12;
    const X = s => padL + (wCss - padL - padR) * s;
    const Y = v => hCss - padB - (hCss - padT - padB) * v / ymax;
    ctx.clearRect(0, 0, wCss, hCss);
    // axes
    ctx.strokeStyle = COL.axis; ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, wCss - padL - padR, hCss - padT - padB);
    ctx.fillStyle = COL.axis; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (const s of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(s.toFixed(2), X(s), hCss - padB + 14);
    ctx.fillText('training progress s (prior → optimal proposal)', (padL + wCss - padR) / 2, hCss - 4);
    ctx.textAlign = 'right';
    const step = niceStep(ymax);
    for (let v = 0; v <= ymax; v += step) {
        ctx.fillText(v.toFixed(step < 0.2 ? 1 : 1), padL - 5, Y(v) + 3);
        ctx.strokeStyle = COL.grid;
        ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(wCss - padR, Y(v)); ctx.stroke();
    }
    ctx.save();
    ctx.translate(10, (padT + hCss - padB) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('rel. std of Ẑ', 0, 0);
    ctx.restore();
    // current-s marker (ties this panel to the trajectory panel's slider)
    if (sMark !== null && sMark !== undefined) {
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(X(sMark), padT); ctx.lineTo(X(sMark), hCss - padB); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('current s', X(sMark), padT - 3);
    }
    // exact SIS line
    ctx.strokeStyle = COL.sis; ctx.lineWidth = 1.6;
    ctx.beginPath();
    sisGrid.forEach(([s, v], i) => (i ? ctx.lineTo(X(s), Y(v)) : ctx.moveTo(X(s), Y(v))));
    ctx.stroke();
    // MC points with error bars
    const colOf = { PT: COL.pt, QT: COL.qt };
    for (const arm of ['PT', 'QT']) {
        ctx.strokeStyle = colOf[arm]; ctx.fillStyle = colOf[arm]; ctx.lineWidth = 1.4;
        const ps = pts[arm];
        ctx.beginPath();
        ps.forEach((p, i) => (i ? ctx.lineTo(X(p.s), Y(p.relstd)) : ctx.moveTo(X(p.s), Y(p.relstd))));
        ctx.stroke();
        for (const p of ps) {
            ctx.beginPath(); ctx.arc(X(p.s), Y(p.relstd), 3, 0, 2 * Math.PI); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(X(p.s), Y(Math.max(0, p.relstd - p.se)));
            ctx.lineTo(X(p.s), Y(p.relstd + p.se)); ctx.stroke();
        }
    }
    // legend
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    const entries = [['SIS (no resampling; exact)', COL.sis], ['SMC, prior targets', COL.pt], ['SMC, proposal targets', COL.qt]];
    entries.forEach(([label, c], i) => {
        const y = padT + 14 + 15 * i;
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(padL + 10, y - 3); ctx.lineTo(padL + 32, y - 3); ctx.stroke();
        ctx.fillStyle = '#333'; ctx.fillText(label, padL + 38, y);
    });
}

function niceStep(ymax) {
    for (const s of [0.05, 0.1, 0.2, 0.5, 1]) if (ymax / s <= 8) return s;
    return 2;
}
