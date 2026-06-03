// ================================================================
//  Temperature scaling — drawing.js
//  Canvas layout + panel rendering. One canvas, four panels:
//
//        base p            tempered p^(T)
//    [prob bars, drag]   [prob bars]
//    [log bars]          [log bars + pre-norm ticks]
// ================================================================

import { K, LOG_FLOOR, COLD_RGB, NEUTRAL_RGB, HOT_RGB, VIOLET_RGB, T_MAX } from './config.js';
import { isNegativeTemp } from './model.js';

// --- Canvas/DOM helpers (same pattern as smc-resampling) ---

export function resetCanvas(canvas) {
    const d = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w, h };
}

export function getPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

// --- Temperature -> color ---
// Cold blue (sharpening) / neutral gray (T = 1) / hot orange (flattening),
// continuing into violet for negative temperatures.

function lerpRGB(a, b, t) {
    return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
}

export function tempColor(T) {
    const absT = Math.abs(T);
    let s; // position in [-1, 1] on the log-|T| axis
    if (absT === 0) s = -1;
    else if (absT === Infinity) s = 1;
    else s = Math.max(-1, Math.min(1, Math.log(absT) / Math.log(T_MAX)));
    const rgb = isNegativeTemp(T)
        // continuous with the positive side: hot orange at T = -infinity
        // (matching +infinity at the symlog center), deepening to violet
        // at T = -0 (argmin) — beyond-infinite temperatures go ultraviolet
        ? lerpRGB(HOT_RGB, VIOLET_RGB, (1 - s) / 2)
        : (s < 0 ? lerpRGB(NEUTRAL_RGB, COLD_RGB, -s) : lerpRGB(NEUTRAL_RGB, HOT_RGB, s));
    return `rgb(${rgb.join(',')})`;
}

// --- Layout ---
// Returns panel rects and coordinate mappers. Panels are addressed by
// {col} (0 = base, 1 = tempered) and {row} (0 = prob, 1 = log).

export function layout(w, h) {
    const m = { top: 24, bottom: 28, left: 34, right: 10 }; // bottom hosts the log-panel labels
    const colGap = 36;
    const rowGap = 24;
    const colW = (w - m.left - m.right - colGap) / 2;
    const rowH = (h - m.top - m.bottom - rowGap) / 2;

    const inset = 8; // horizontal padding inside a panel
    const slotW = (colW - 2 * inset) / K;
    const barW = Math.min(slotW * 0.62, 40);

    function panel(col, row) {
        return {
            col, row,
            x: m.left + col * (colW + colGap),
            y: m.top + row * (rowH + rowGap),
            w: colW,
            h: rowH,
        };
    }

    // Center x of bar i within panel P
    function barX(P, i) { return P.x + inset + (i + 0.5) * slotW; }

    // prob space: v in [0,1] -> y (0 at panel bottom, 1 at panel top)
    function probY(P, v) { return P.y + P.h - v * P.h; }

    // log space: l in [LOG_FLOOR, 0] -> y (0 at panel top, floor at bottom)
    function logY(P, l) {
        return P.y + (Math.max(l, LOG_FLOOR) / LOG_FLOOR) * P.h;
    }

    return { inset, slotW, barW, panel, barX, probY, logY };
}

// --- Small text helpers ---

const SANS = '-apple-system, BlinkMacSystemFont, sans-serif';

// Panel label like "log p^(T)": roman prefix + italic symbol + superscript,
// centered horizontally on cx.
function drawPanelLabel(ctx, cx, y, { pre, sym, sup }) {
    const parts = [
        pre && { font: '12px Georgia, serif', text: pre },
        { font: 'italic 13px Georgia, serif', text: sym, gapAfter: sup ? 1 : 0 },
        sup && { font: 'italic 9px Georgia, serif', text: sup, dy: -5 },
    ].filter(Boolean);
    const widths = parts.map(p => {
        ctx.font = p.font;
        return ctx.measureText(p.text).width;
    });
    const total = parts.reduce((sum, p, i) => sum + widths[i] + (p.gapAfter || 0), 0);

    let x = cx - total / 2;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#555';
    parts.forEach((p, i) => {
        ctx.font = p.font;
        ctx.fillText(p.text, x, y + (p.dy || 0));
        x += widths[i] + (p.gapAfter || 0);
    });
}

function drawTick(ctx, x, y, label) {
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.font = '10px ' + SANS;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x - 7, y);
}

// Dashed reference line at the uniform distribution (the beta -> 0 limit).
// Its label sits in the gap to the right of the left column, clear of bars.
function drawUniformRef(ctx, P, y, label) {
    ctx.save();
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(P.x + 2, y);
    ctx.lineTo(P.x + P.w - 2, y);
    ctx.stroke();
    ctx.restore();
    if (P.col === 0) {
        ctx.font = 'italic 9px Georgia, serif';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, P.x + P.w + 4, y);
    }
}

// --- Probability-space panel ---
// opts: { color, label: {pre, sym, sup}, handles: bool }

export function drawProbPanel(ctx, L, P, values, opts) {
    // baseline (x-axis)
    const y0 = L.probY(P, 0);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, y0);
    ctx.lineTo(P.x + P.w, y0);
    ctx.stroke();

    // y ticks on the left column only (shared scale)
    if (P.col === 0) {
        drawTick(ctx, P.x, L.probY(P, 0), '0');
        drawTick(ctx, P.x, L.probY(P, 1), '1');
    }

    drawUniformRef(ctx, P, L.probY(P, 1 / K), '1/K');

    values.forEach((v, i) => {
        const cx = L.barX(P, i);
        const yTop = L.probY(P, v);
        ctx.fillStyle = opts.color;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(cx - L.barW / 2, yTop, L.barW, y0 - yTop);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = opts.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - L.barW / 2, yTop, L.barW, y0 - yTop);
        if (opts.handles) {
            // thicker top edge as drag affordance
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx - L.barW / 2, yTop);
            ctx.lineTo(cx + L.barW / 2, yTop);
            ctx.stroke();
        }
    });

    // label above the panel (probability values grow upward)
    drawPanelLabel(ctx, P.x + P.w / 2, P.y - 8, opts.label);
}

// --- Log-space panel ---
// opts: { color, label: {pre, sym, sup}, ghost: array|null }
// `ghost` marks the pre-normalization values beta·log p as horizontal
// ticks, with a dotted connector to the bar end: the common -log Z shift.
// Values below LOG_FLOOR are clamped: bars get a triangle at the floor,
// ghost ticks an inverted caret.

export function drawLogPanel(ctx, L, P, values, opts) {
    const y0 = L.logY(P, 0);
    const yFloor = L.logY(P, LOG_FLOOR);

    // 0-line at panel top
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, y0);
    ctx.lineTo(P.x + P.w, y0);
    ctx.stroke();

    if (P.col === 0) {
        drawTick(ctx, P.x, y0, '0');
        drawTick(ctx, P.x, yFloor, String(LOG_FLOOR));
    }

    drawUniformRef(ctx, P, L.logY(P, Math.log(1 / K)), 'log 1/K');

    // bars hang down from the 0-line
    values.forEach((v, i) => {
        const cx = L.barX(P, i);
        const clamped = v < LOG_FLOOR;
        const yBot = L.logY(P, v);
        ctx.fillStyle = opts.color;
        ctx.globalAlpha = clamped ? 0.25 : 0.45;
        ctx.fillRect(cx - L.barW / 2, y0, L.barW, yBot - y0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = opts.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - L.barW / 2, y0, L.barW, yBot - y0);
        if (clamped) {
            ctx.beginPath();
            ctx.moveTo(cx - 4, yFloor + 3);
            ctx.lineTo(cx + 4, yFloor + 3);
            ctx.lineTo(cx, yFloor + 9);
            ctx.closePath();
            ctx.fillStyle = opts.color;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    });

    if (opts.ghost) {
        opts.ghost.forEach((g, i) => {
            const cx = L.barX(P, i);
            const yG = L.logY(P, g);
            ctx.strokeStyle = '#444';
            // dotted connector (the common -log Z shift)
            ctx.save();
            ctx.setLineDash([2, 3]);
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, yG);
            ctx.lineTo(cx, L.logY(P, values[i]));
            ctx.stroke();
            ctx.restore();
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            if (g < LOG_FLOOR) {
                ctx.moveTo(cx - L.barW / 2 - 2, yFloor + 3);
                ctx.lineTo(cx, yFloor + 9);
                ctx.lineTo(cx + L.barW / 2 + 2, yFloor + 3);
            } else {
                ctx.moveTo(cx - L.barW / 2 - 2, yG);
                ctx.lineTo(cx + L.barW / 2 + 2, yG);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    }

    // label below the panel (log values grow downward), clear of the
    // caret/triangle band at the floor
    drawPanelLabel(ctx, P.x + P.w / 2, P.y + P.h + 22, opts.label);
}
