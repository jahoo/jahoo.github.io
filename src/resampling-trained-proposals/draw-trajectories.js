// ================================================================
//  Trajectory rendering: one lane per particle slot (y), time (x),
//  DEPTH as color (darker = deeper), band thickness = share of the
//  pool's resampling weight. Each step's band fills only part of the
//  step width; thin gray connectors in the gap link each band to its
//  successor — at resampling events they fan out from the ancestor,
//  the standard genealogy-diagram idiom. Hover shows exact state.
// ================================================================

import { runOne } from './simulate.js';
import { COL, setupCanvas } from './config.js';

// sequential ramp for depth 0..8+ (light = shallow/safe, dark = deep/risky)
const DEPTH_COLORS = ['#dbe9f6', '#b5d2ec', '#8fbbe1', '#69a3d3', '#4a8ac2',
    '#3270ad', '#215694', '#123f7c', '#082a63'];
export function depthColor(d) {
    return DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];
}

const T_DRAW_CAP = 40;
const BAND_FRAC = 0.62;           // portion of a step's width given to the band
const registry = new WeakMap();   // canvas -> {run, M, geom} for hover lookup

function poolTotal(step, M) {
    let sw = 0;
    for (let m = 0; m < M; m++) if (step.phase[m] !== 3) sw += step.w[m];
    return sw > 0 ? sw : 1e-300;
}

export function drawRun(canvas, run, M, title, opts = {}) {
    const wCss = canvas.parentElement.clientWidth;
    const hCss = parseInt(canvas.dataset.h || '280', 10);
    const ctx = setupCanvas(canvas, wCss, hCss);
    const { steps, events } = run;
    const T = Math.min(steps.length, T_DRAW_CAP);
    const padL = 26, padR = opts.padR ?? 10;
    const padT = opts.padT ?? 20, padB = opts.padB ?? 18;
    const laneH = (hCss - padT - padB) / M;
    const cellW = (wCss - padL - padR) / Math.max(T, 1);
    const bandW = cellW * BAND_FRAC;
    const X = t => padL + cellW * t;
    const laneY = m => padT + laneH * (m + 0.5);
    const cutX = t => X(t) + bandW;   // at the band end, where the ancestry fan starts
    const geom = { padL, padT, padB, laneH, cellW, bandW, T, wCss, hCss, cutX };
    registry.set(canvas, { run, M, geom });
    const evByT = new Map(events.map(e => [e.afterT, e]));
    ctx.clearRect(0, 0, wCss, hCss);
    // frame text
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(title, padL, 13);
    ctx.fillStyle = COL.axis; ctx.font = '10px sans-serif';
    ctx.fillText('t →', wCss - padR - 22, hCss - 4);
    ctx.save(); ctx.translate(9, (padT + hCss - padB) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('particles', 0, 0); ctx.restore();

    // --- connectors (drawn first, under everything) ---
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.9;
    for (let t = 0; t + 1 < T; t++) {
        const ev = evByT.get(t);
        const ancOf = m => {
            if (!ev) return m;
            const i = ev.pool.indexOf(m);
            return i >= 0 ? ev.anc[i] : m;
        };
        const st = steps[t];
        for (let m = 0; m < M; m++) {
            const a = ancOf(m);
            if (st.phase[a] > 1) continue;          // ancestor not active: no successor
            ctx.beginPath();
            ctx.moveTo(X(t) + bandW, laneY(a));
            ctx.lineTo(X(t + 1), laneY(m));
            ctx.stroke();
        }
    }

    // --- bands and state marks ---
    const doneAt = new Array(M).fill(Infinity);
    for (let t = 0; t < T; t++) {
        const st = steps[t];
        const sw = poolTotal(st, M);
        for (let m = 0; m < M; m++) {
            if (t > doneAt[m]) continue;
            const y = laneY(m);
            if (st.phase[m] === 3) {                       // completed at this step
                if (doneAt[m] === Infinity) {
                    doneAt[m] = t;
                    const valid = st.w[m] > 0;
                    ctx.fillStyle = valid ? COL.validEnd : COL.invalidEnd;
                    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('¤', X(t) + bandW * 0.5, y + 4);
                }
                continue;
            }
            if (st.phase[m] === 2) {                       // dead: faint dotted stub
                const stillDead = t + 1 < T && steps[t + 1].phase[m] === 2;
                ctx.strokeStyle = 'rgba(200, 80, 80, 0.38)'; ctx.lineWidth = 1;
                ctx.setLineDash([1.5, 3]);
                ctx.beginPath(); ctx.moveTo(X(t), y);
                ctx.lineTo(stillDead ? X(t + 1) : X(t) + bandW, y); ctx.stroke();
                ctx.setLineDash([]);
                if (t === 0 || steps[t - 1].phase[m] <= 1) {   // moment of death
                    ctx.strokeStyle = 'rgba(195, 60, 60, 0.75)'; ctx.lineWidth = 1.5;
                    const cx = X(t) + bandW * 0.5;
                    ctx.beginPath(); ctx.moveTo(cx - 3.5, y - 3.5); ctx.lineTo(cx + 3.5, y + 3.5);
                    ctx.moveTo(cx - 3.5, y + 3.5); ctx.lineTo(cx + 3.5, y - 3.5); ctx.stroke();
                }
                continue;
            }
            // live: band colored by depth, thickness = share of pool weight
            const share = st.w[m] / sw;
            const bh = Math.min(laneH - 2, 1.6 + (laneH - 3.5) * Math.sqrt(share));
            ctx.fillStyle = depthColor(st.depth[m]);
            ctx.fillRect(X(t), y - bh / 2, bandW, bh);
        }
    }

    // --- resampling cuts (in the gap) + kill marks ---
    for (const e of events) {
        if (e.afterT >= T) continue;
        const x = cutX(e.afterT);
        ctx.strokeStyle = COL.eventLine; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, hCss - padB); ctx.stroke();
        ctx.setLineDash([]);
        const st = steps[e.afterT];
        const chosen = new Set(e.anc);
        for (const m of e.pool) {
            if (!chosen.has(m) && st.phase[m] <= 1) {      // live particle killed
                const y = laneY(m);
                ctx.strokeStyle = COL.killMark; ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
                ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y - 4); ctx.stroke();
            }
        }
    }
    if (opts.annotate) opts.annotate({ ctx, X, laneY, geom });
    return { X, laneY, geom };
}

// --- annotation helpers (visually distinct from data ink) ---
export function label(ctx, text, tx, ty, color = '#8a4b0f') {
    ctx.save();
    ctx.font = 'italic 11px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, tx, ty); ctx.fillStyle = color; ctx.fillText(text, tx, ty);
    ctx.restore();
}

// curved arrow with arrowhead; bend = +1/-1 picks the bowing side
export function curveArrow(ctx, x0, y0, x1, y1, color = '#c26d21', bend = 1) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.hypot(dx, dy) || 1;
    const off = bend * Math.min(22, n * 0.3);
    const cx = mx - dy / n * off, cy = my + dx / n * off;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - cy, x1 - cx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 7 * Math.cos(ang - 0.38), y1 - 7 * Math.sin(ang - 0.38));
    ctx.lineTo(x1 - 7 * Math.cos(ang + 0.38), y1 - 7 * Math.sin(ang + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

export function ring(ctx, x, y, r, color = '#c26d21') {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore();
}

// hover tooltip: exact particle state under the cursor
export function attachHover(canvas, tooltip) {
    canvas.addEventListener('mousemove', ev => {
        const entry = registry.get(canvas);
        if (!entry) return;
        const { run, M, geom } = entry;
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
        const t = Math.floor((mx - geom.padL) / geom.cellW);
        const m = Math.floor((my - geom.padT) / geom.laneH);
        if (t < 0 || t >= geom.T || m < 0 || m >= M) { tooltip.style.display = 'none'; return; }
        const st = run.steps[t];
        const parts = [`particle ${m}`, `after step ${t + 1}`];
        if (st.phase[m] === 3) {
            if (st.w[m] > 0) parts.push('completed ✓ valid', `final w = ${st.w[m].toPrecision(3)}`);
            else parts.push('completed ✗ invalid', 'w = 0');
        } else if (st.phase[m] === 2) {
            parts.push('dead (emitted > at depth 0)', 'w = 0');
        } else {
            const sw = poolTotal(st, M);
            parts.push(`depth ${st.depth[m]}`,
                `w = ${st.w[m].toPrecision(3)} (${(100 * st.w[m] / sw).toFixed(0)}% of pool)`);
        }
        tooltip.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
        tooltip.style.display = 'block';
        const host = tooltip.parentElement.getBoundingClientRect();
        tooltip.style.left = (ev.clientX - host.left + 12) + 'px';
        tooltip.style.top = (ev.clientY - host.top + 14) + 'px';
    });
    canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

export function renderTrajectories(state, els) {
    const runPT = runOne(state.P, state.s, 'PT', state.M, state.seed);
    const runQT = runOne(state.P, state.s, 'QT', state.M, state.seed);
    drawRun(els.cvPT, runPT, state.M, 'SMC, prior targets (standard)');
    drawRun(els.cvQT, runQT, state.M, 'SMC, proposal targets (the fix)');
    const fmt = r => `Ẑ = ${r.zhat.toPrecision(3)} (Z = ${r.Z.toPrecision(3)}), ${r.events.length} resampling event${r.events.length === 1 ? '' : 's'}`;
    els.info.textContent = `prior targets: ${fmt(runPT)}  |  proposal targets: ${fmt(runQT)}`;
}
