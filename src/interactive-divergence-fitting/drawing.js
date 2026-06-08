// ================================================================
//  Interactive divergence fitting — drawing.js
//  All canvas rendering: the heatmap palette, the distribution panels
//  (target p, fitted q, optima, particle rug) and the loss-landscape
//  panels (heatmap wash, marching-squares contours, minima, q marker).
//  Drawing functions take their canvas as an argument; they read shared
//  state (`S`) for the data to render.
// ================================================================

import { S } from './state.js';
import { X_MIN, X_MAX, N_GRID } from './config.js';
import { gaussPdf, gaussLogPdf, mixturePdf, mixtureLogPdf } from './mathutils.js';
import { curP, qToLand, muSigmaToLand } from './parameterizations.js';

export const PURPLE = '#7B2D8E';

// ===== Canvas coordinate helpers (1D distribution panels) =====
export function xToC(x, c) { return (x - X_MIN) / (X_MAX - X_MIN) * c.width; }
export function cToX(cx, c) { return X_MIN + (cx / c.width) * (X_MAX - X_MIN); }
export function yToC(y, c, yMax) {
    const dpr = window.devicePixelRatio || 1;
    const margin = 20 * dpr;
    return c.height - margin - (y / yMax) * (c.height - margin);
}

export function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
}

// White (KL=0) → yellow → orange → red (high KL)
export function heatmap(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
        [0.00, 1.00, 1.00, 1.00],   // white (KL = 0)
        [0.40, 1.00, 1.00, 0.55],   // yellow
        [0.65, 1.00, 0.65, 0.15],   // orange
        [0.85, 0.85, 0.20, 0.05],   // red
        [1.00, 0.50, 0.00, 0.00],   // dark red
    ];
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    const f = (t - t0) / (t1 - t0);
    const r = Math.round(255 * (r0 + f * (r1 - r0)));
    const g = Math.round(255 * (g0 + f * (g1 - g0)));
    const b = Math.round(255 * (b0 + f * (b1 - b0)));
    return `rgb(${r},${g},${b})`;
}

export function computeYMax(q, optima) {
    const dx = (X_MAX - X_MIN) / N_GRID;
    let yMax = 0;
    for (let i = 0; i <= N_GRID; i++) {
        const x = X_MIN + i * dx;
        yMax = Math.max(yMax, mixturePdf(x, S.pComps), gaussPdf(x, q.mu, q.sigma));
    }
    if (optima) for (const opt of optima)
        for (let i = 0; i <= N_GRID; i++)
            yMax = Math.max(yMax, gaussPdf(X_MIN + i * dx, opt.mu, opt.sigma));
    return yMax * 1.15;
}

export function drawLandscape(canvas, grid, q, optima) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Resize
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const margin = 25 * dpr;
    const plotW = canvas.width - margin;
    const plotH = canvas.height - margin;

    function muToX(mu) { return margin + (mu - S.landMuMin) / (S.landMuMax - S.landMuMin) * plotW; }
    function lsToY(ls) { return (1 - (ls - S.landLsMin) / (S.landLsMax - S.landLsMin)) * plotH; }

    // Subtle background fill + contour lines
    const cellW = plotW / (S.landCurRes - 1);
    const cellH = plotH / (S.landCurRes - 1);

    // Light heatmap wash for orientation
    ctx.globalAlpha = 0.12;
    for (let j = 0; j < S.landCurRes; j++) {
        for (let i = 0; i < S.landCurRes; i++) {
            const v = Math.log10(Math.max(grid[j * S.landCurRes + i], 1e-2));
            const t = (v - S.landVmin) / (S.landVmax - S.landVmin + 1e-8);
            ctx.fillStyle = heatmap(t);
            const cx = margin + i * cellW;
            const cy = (S.landCurRes - 1 - j) * cellH;
            ctx.fillRect(cx - cellW / 2, cy - cellH / 2, cellW + 1, cellH + 1);
        }
    }
    ctx.globalAlpha = 1.0;

    // Contour lines via marching squares
    const rawLogGrid = new Float64Array(S.landCurRes * S.landCurRes);
    for (let k = 0; k < rawLogGrid.length; k++) {
        const v = Math.log10(Math.max(grid[k], 1e-3));
        rawLogGrid[k] = isFinite(v) ? v : 100;
    }
    // 5×5 median filter: cleans up integration noise in extreme regions,
    // no-op in the smooth basin where neighbors agree
    const logGrid = new Float64Array(rawLogGrid.length);
    const _med = new Float64Array(25);
    for (let j = 0; j < S.landCurRes; j++) {
        for (let i = 0; i < S.landCurRes; i++) {
            let n = 0;
            for (let dj = -2; dj <= 2; dj++)
                for (let di = -2; di <= 2; di++) {
                    const jj = Math.max(0, Math.min(S.landCurRes - 1, j + dj));
                    const ii = Math.max(0, Math.min(S.landCurRes - 1, i + di));
                    _med[n++] = rawLogGrid[jj * S.landCurRes + ii];
                }
            _med.sort();
            logGrid[j * S.landCurRes + i] = _med[12];
        }
    }

    // Per-panel contour range: dense in the basin, sparse in the cliff
    const sorted = Float64Array.from(logGrid).filter(v => isFinite(v) && v > S.landVmin).sort();
    const panelVknee = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.85)] : S.landVmax;
    const panelVtop = sorted.length > 0 ? sorted[sorted.length - 1] : S.landVmax;

    // Marching squares segment lookup (SW=bit0 SE=bit1 NE=bit2 NW=bit3)
    // Edges: 0=south 1=east 2=west 3=north
    const CS = [[],[[0,2]],[[0,1]],[[2,1]],[[3,1]],[[0,2],[3,1]],
        [[0,3]],[[2,3]],[[3,2]],[[0,3]],[[0,1],[3,2]],
        [[3,1]],[[2,1]],[[0,1]],[[0,2]],[]];

    const nMain = 20, nTail = 5;
    for (let li = 1; li <= nMain + nTail; li++) {
        const level = li <= nMain
            ? S.landVmin + (panelVknee - S.landVmin) * li / nMain
            : panelVknee + (panelVtop - panelVknee) * (li - nMain) / nTail;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(80,80,80,0.3)';
        ctx.lineWidth = 1.0 * dpr;

        for (let j = 0; j < S.landCurRes - 1; j++) {
            for (let i = 0; i < S.landCurRes - 1; i++) {
                const sw = logGrid[j * S.landCurRes + i];
                const se = logGrid[j * S.landCurRes + i + 1];
                const ne = logGrid[(j+1) * S.landCurRes + i + 1];
                const nw = logGrid[(j+1) * S.landCurRes + i];

                const c = ((sw >= level) ? 1 : 0) | ((se >= level) ? 2 : 0) |
                          ((ne >= level) ? 4 : 0) | ((nw >= level) ? 8 : 0);
                if (c === 0 || c === 15) continue;

                const x0 = margin + i * cellW, x1 = x0 + cellW;
                const yBot = (S.landCurRes - 1 - j) * cellH;

                const lerp = (a, b) => (level - a) / (b - a + 1e-15);
                const ep = [
                    { x: x0 + lerp(sw, se) * cellW, y: yBot },
                    { x: x1, y: yBot - lerp(se, ne) * cellH },
                    { x: x0, y: yBot - lerp(sw, nw) * cellH },
                    { x: x0 + lerp(nw, ne) * cellW, y: yBot - cellH },
                ];

                for (const [e1, e2] of CS[c]) {
                    ctx.moveTo(ep[e1].x, ep[e1].y);
                    ctx.lineTo(ep[e2].x, ep[e2].y);
                }
            }
        }
        ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(margin, 0); ctx.lineTo(margin, plotH);
    ctx.lineTo(margin + plotW, plotH); ctx.stroke();

    ctx.fillStyle = '#666'; ctx.font = (9 * dpr) + 'px sans-serif';
    // Smart tick step based on axis range
    function tickStep(range) {
        const rough = range / 6;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
    }
    function fmtTick(v, step) {
        return step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    }
    const xStep = tickStep(S.landMuMax - S.landMuMin);
    const yStep = tickStep(S.landLsMax - S.landLsMin);
    ctx.textAlign = 'center';
    for (let t = Math.ceil(S.landMuMin / xStep) * xStep; t <= S.landMuMax; t += xStep) {
        const x = muToX(t);
        ctx.fillText(fmtTick(t, xStep), x, plotH + 13 * dpr);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let t = Math.ceil(S.landLsMin / yStep) * yStep; t <= S.landLsMax; t += yStep) {
        const y = lsToY(t);
        ctx.fillText(fmtTick(t, yStep), margin - 4 * dpr, y);
    }
    const [xLabel, yLabel] = curP().axes;
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, margin + plotW / 2, plotH + 22 * dpr);
    ctx.save(); ctx.translate(8 * dpr, plotH / 2);
    ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();

    // Minima markers
    if (optima) {
        for (let oi = 0; oi < optima.length; oi++) {
            const opt = optima[oi];
            const isGlobal = (oi === 0);
            const [oa1, oa2] = muSigmaToLand(opt.mu, opt.sigma);
            const ox = muToX(oa1);
            const oy = lsToY(oa2);
            const s = isGlobal ? 5 * dpr : 4 * dpr;
            ctx.lineWidth = (isGlobal ? 2 : 1.5) * dpr;
            ctx.lineCap = 'round';
            ctx.strokeStyle = isGlobal ? 'rgba(123,45,142,0.9)' : 'rgba(123,45,142,0.5)';
            ctx.beginPath();
            // × for all
            ctx.moveTo(ox - s, oy - s); ctx.lineTo(ox + s, oy + s);
            ctx.moveTo(ox + s, oy - s); ctx.lineTo(ox - s, oy + s);
            if (isGlobal) {
                // + overlay for global (star)
                ctx.moveTo(ox, oy - s); ctx.lineTo(ox, oy + s);
                ctx.moveTo(ox - s, oy); ctx.lineTo(ox + s, oy);
            }
            ctx.stroke();
        }
    }

    // Current q position (thick purple open circle)
    const [qa1, qa2] = qToLand(q);
    const qx = muToX(qa1);
    const qy = lsToY(qa2);
    ctx.beginPath(); ctx.arc(qx, qy, 7 * dpr, 0, 2 * Math.PI);
    ctx.strokeStyle = PURPLE; ctx.lineWidth = 3 * dpr; ctx.stroke();
}

export function drawPanel(canvas, q, optima, particles, label) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dx = (X_MAX - X_MIN) / N_GRID;
    const yMax = computeYMax(q, optima);

    // X-axis
    const margin = 20 * dpr;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(0, canvas.height - margin);
    ctx.lineTo(canvas.width, canvas.height - margin); ctx.stroke();
    ctx.fillStyle = '#aaa'; ctx.font = (10 * dpr) + 'px sans-serif'; ctx.textAlign = 'center';
    for (let t = Math.ceil(X_MIN); t <= Math.floor(X_MAX); t++) {
        const cx = xToC(t, canvas);
        ctx.beginPath(); ctx.moveTo(cx, canvas.height - margin);
        ctx.lineTo(cx, canvas.height - margin + 3 * dpr); ctx.stroke();
        ctx.fillText(t, cx, canvas.height - 4 * dpr);
    }

    // Target p (filled)
    ctx.beginPath();
    ctx.moveTo(xToC(X_MIN, canvas), yToC(0, canvas, yMax));
    for (let i = 0; i <= N_GRID; i++) {
        const x = X_MIN + i * dx;
        ctx.lineTo(xToC(x, canvas), yToC(mixturePdf(x, S.pComps), canvas, yMax));
    }
    ctx.lineTo(xToC(X_MAX, canvas), yToC(0, canvas, yMax));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();

    // Optimal q* curves (dashed = global, dotted = local)
    if (optima) {
        for (let oi = optima.length - 1; oi >= 0; oi--) {
            const opt = optima[oi];
            const isGlobal = (oi === 0);
            ctx.beginPath();
            ctx.setLineDash(isGlobal ? [6 * dpr, 4 * dpr] : [3 * dpr, 4 * dpr]);
            for (let i = 0; i <= N_GRID; i++) {
                const x = X_MIN + i * dx;
                const y = gaussPdf(x, opt.mu, opt.sigma);
                if (i === 0) ctx.moveTo(xToC(x, canvas), yToC(y, canvas, yMax));
                else ctx.lineTo(xToC(x, canvas), yToC(y, canvas, yMax));
            }
            ctx.strokeStyle = isGlobal ? 'rgba(123,45,142,0.6)' : 'rgba(123,45,142,0.3)';
            ctx.lineWidth = (isGlobal ? 1.5 : 1) * dpr;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Theoretical curve and particle stems — both use the same normalization.
    // r(z) = log p_tilde(z) - log q(z) is the common quantity.
    // Forward KL shows exp(r) (importance weights); reverse shows r (reward/ELBO integrand).
    const stemMax = 0.15 * yMax;
    const baselineY = yToC(0, canvas, yMax);
    const isFwd = (label === 'fwd');

    // Forward: dotted purple curve showing theoretical weight (MC mode only)
    // Shows w = p̃/q for KL, w² = (p̃/q)² for χ²
    if (isFwd && S.gradientMode === 'mc') {
        const curveW = new Float64Array(N_GRID + 1);
        let wMax = 0;
        const useWSquared = (S.divergenceType === 'chisq');
        for (let i = 0; i <= N_GRID; i++) {
            const x = X_MIN + i * dx;
            const r = mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, q.mu, q.sigma);
            const w = Math.exp(r);
            curveW[i] = useWSquared ? w * w : w;
            if (curveW[i] > wMax) wMax = curveW[i];
        }
        if (wMax > 0) {
            ctx.beginPath();
            ctx.setLineDash([2 * dpr, 2 * dpr]);
            for (let i = 0; i <= N_GRID; i++) {
                const cx = xToC(X_MIN + i * dx, canvas);
                const cy = yToC((curveW[i] / wMax) * stemMax, canvas, yMax);
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            }
            ctx.strokeStyle = 'rgba(50,100,220,0.4)';
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Particle rug plot below x-axis
    // Unified: blue = positive α_i (pull), red = negative (push), opacity ∝ |α_i|
    if (particles && particles.alpha) {
        const rugH = 8 * dpr;
        const axisY = canvas.height - margin;

        let maxAbs = 0;
        for (let i = 0; i < particles.alpha.length; i++) {
            const a = Math.abs(particles.alpha[i]);
            if (a > maxAbs) maxAbs = a;
        }
        if (maxAbs === 0) maxAbs = 1;

        for (let i = 0; i < particles.alpha.length; i++) {
            const px = xToC(particles.z[i], canvas);
            const ai = particles.alpha[i];
            const opacity = (0.1 + 0.9 * Math.abs(ai) / maxAbs).toFixed(2);

            ctx.strokeStyle = ai >= 0
                ? `rgba(50,100,220,${opacity})`
                : `rgba(200,50,50,${opacity})`;
            ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px, axisY);
            ctx.lineTo(px, axisY + rugH);
            ctx.stroke();
        }
    }

    // Fitted q (solid purple)
    ctx.beginPath();
    for (let i = 0; i <= N_GRID; i++) {
        const x = X_MIN + i * dx;
        const y = gaussPdf(x, q.mu, q.sigma);
        if (i === 0) ctx.moveTo(xToC(x, canvas), yToC(y, canvas, yMax));
        else ctx.lineTo(xToC(x, canvas), yToC(y, canvas, yMax));
    }
    ctx.strokeStyle = PURPLE; ctx.lineWidth = 2.5 * dpr; ctx.stroke();

    // Handles: target mode peaks
    for (const c of S.pComps) {
        const cx = xToC(c.mu, canvas);
        const cy = yToC(c.w * gaussPdf(c.mu, c.mu, c.sigma), canvas, yMax);
        ctx.beginPath(); ctx.arc(cx, cy, 5 * dpr, 0, 2 * Math.PI);
        ctx.fillStyle = (S.hoveredHandle && S.hoveredHandle.comp === c) ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.2)';
        ctx.fill();
    }

    // Handle: q peak
    const qcx = xToC(q.mu, canvas);
    const qcy = yToC(gaussPdf(q.mu, q.mu, q.sigma), canvas, yMax);
    ctx.beginPath(); ctx.arc(qcx, qcy, 5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = (S.hoveredHandle && S.hoveredHandle.q === q)
        ? PURPLE : 'rgba(123,45,142,0.35)';
    ctx.fill();
}
