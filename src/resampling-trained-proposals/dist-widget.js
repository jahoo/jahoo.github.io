// ================================================================
//  Distribution-column widget: the one way probability distributions
//  are shown on this page. A block = a canvas holding one or more
//  columns; each column is a distribution over the three tokens,
//  drawn as neutral horizontal bars with the value at the tip.
//  Editable blocks get drag handles at the bar tips (drag
//  renormalizes within the column, anchored-forward-kl style);
//  read-only blocks are the same geometry without handles.
// ================================================================

import { setupCanvas } from './config.js';

const TOKENS = ['<', '>', '¤'];
const BAR = '#7d92a8';           // one neutral color for every distribution bar
const BAR_RO = '#93a5b7';        // read-only blocks: slightly lighter
const MIN_P = 0.02;
const ROW_H = 21, TITLE_H = 15, PAD_B = 5, PAD_GLYPH = 16, GAP = 16;

// Set dist[i] to target, rescaling the others to keep the sum at 1.
function withProb(dist, i, target) {
    target = Math.max(MIN_P, Math.min(1 - (dist.length - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - dist[i]);
    const out = dist.map((p, j) => (j === i ? target : Math.max(MIN_P, p * scale)));
    const s = out.reduce((a, b) => a + b, 0);
    return out.map(v => v / s);
}

// opts: { getColumns: () => [{title, dist}], editable, onEdit(col, newDist),
//         colW? }
export function createDistBlock(canvas, opts) {
    const colW = opts.colW ?? 112;
    let drag = null;   // { col, row }

    function geom(ncols) {
        return {
            ncols,
            colX: c => PAD_GLYPH + c * (colW + GAP),
            rowY: r => TITLE_H + ROW_H * (r + 0.5),
            barMax: colW - 32,
            w: PAD_GLYPH + ncols * colW + (ncols - 1) * GAP + 4,
            h: TITLE_H + 3 * ROW_H + PAD_B,
        };
    }

    function draw() {
        const cols = opts.getColumns();
        const g = geom(cols.length);
        const ctx = setupCanvas(canvas, g.w, g.h);
        ctx.clearRect(0, 0, g.w, g.h);
        const color = opts.editable ? BAR : BAR_RO;
        // token glyphs once, left of the block
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#555';
        for (let r = 0; r < 3; r++) ctx.fillText(TOKENS[r], 2, g.rowY(r) + 4);
        cols.forEach((col, c) => {
            const x0 = g.colX(c);
            ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(col.title, x0, 9);
            ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, TITLE_H); ctx.lineTo(x0, g.h - 2); ctx.stroke();
            col.dist.forEach((v, r) => {
                const y = g.rowY(r);
                const len = v * g.barMax;
                const bh = 13;
                if (v < 1e-9) {                    // structural zero: hairline + 0
                    ctx.strokeStyle = '#c9ced4';
                    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 5, y); ctx.stroke();
                    ctx.fillStyle = '#aaa'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
                    ctx.fillText('0', x0 + 8, y + 3);
                    return;
                }
                ctx.fillStyle = color; ctx.globalAlpha = 0.38;
                ctx.fillRect(x0, y - bh / 2, len, bh);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = color; ctx.lineWidth = 1;
                ctx.strokeRect(x0, y - bh / 2, len, bh);
                if (opts.editable) {               // drag handle at the tip
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x0 + len, y - bh / 2 - 1.5);
                    ctx.lineTo(x0 + len, y + bh / 2 + 1.5);
                    ctx.stroke();
                }
                ctx.fillStyle = '#777'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
                ctx.fillText(v.toFixed(2), x0 + len + 4, y + 3);
            });
        });
    }

    function pick(ev) {
        const cols = opts.getColumns();
        const g = geom(cols.length);
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        for (let c = 0; c < g.ncols; c++) {
            if (x >= g.colX(c) - 4 && x <= g.colX(c) + colW + 4) {
                const r = Math.floor((y - TITLE_H) / ROW_H);
                if (r >= 0 && r < 3) return { col: c, row: r };
            }
        }
        return null;
    }

    if (opts.editable) {
        canvas.style.touchAction = 'none';
        const apply = ev => {
            const cols = opts.getColumns();
            const g = geom(cols.length);
            const rect = canvas.getBoundingClientRect();
            const target = (ev.clientX - rect.left - g.colX(drag.col)) / g.barMax;
            opts.onEdit(drag.col, withProb(cols[drag.col].dist, drag.row, target));
        };
        canvas.addEventListener('pointerdown', ev => {
            const hit = pick(ev);
            if (!hit) return;
            drag = hit;
            canvas.setPointerCapture(ev.pointerId);
            ev.preventDefault();
            apply(ev);
        });
        canvas.addEventListener('pointermove', ev => {
            if (!drag) {
                canvas.style.cursor = pick(ev) ? 'ew-resize' : 'default';
                return;
            }
            apply(ev);
        });
        canvas.addEventListener('pointerup', () => { drag = null; });
        canvas.addEventListener('pointercancel', () => { drag = null; });
    }

    return { draw };
}
