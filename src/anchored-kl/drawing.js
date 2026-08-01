// ================================================================
//  Anchored forward KL — drawing.js
//  Canvas layout + rendering. One main canvas with four columns of
//  horizontal bars over a shared row grid (one row per element):
//
//    [ r (potential) | p (prior) | π (posterior) | q*β (optimum) ]
//
//  plus the beta-segment diagram and the margin alpha(beta) plot.
// ================================================================

// --- Canvas/DOM helpers (same pattern as temperature) ---

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

// --- Small text helpers ---

const SANS = '-apple-system, BlinkMacSystemFont, sans-serif';

// Label built from parts [{text, font, dy, color}], centered on cx.
function drawLabel(ctx, cx, y, parts) {
    const widths = parts.map(p => {
        ctx.font = p.font;
        return ctx.measureText(p.text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    parts.forEach((p, i) => {
        ctx.font = p.font;
        ctx.fillStyle = p.color || '#555';
        ctx.fillText(p.text, x, y + (p.dy || 0));
        x += widths[i];
    });
}

const IT = 'italic 14px Georgia, serif';
const IT_SM = 'italic 9px Georgia, serif';

const fmtTick = v => Number(v.toPrecision(2)).toString();

// --- Main-canvas layout ---
// Four columns over one row grid. The potential column is narrow (its
// values are just 0/1); the three probability columns share their width
// and their x-scale, so bar lengths are comparable across them.

export function layoutMain(w, h, k, { potW = 54 } = {}) {
    const top = 34, bottom = 24, left = 10, right = 12, gap = 26;
    const probW = Math.max(40, (w - left - right - potW - 3 * gap) / 3);
    const rowsH = h - top - bottom;
    const rowH = rowsH / k;
    const barH = Math.min(rowH * 0.6, 20);

    const rowY = i => top + (i + 0.5) * rowH;      // row center
    const rowAt = y => {
        const i = Math.floor((y - top) / rowH);
        return i >= 0 && i < k ? i : -1;
    };
    const pot = { x: left, w: potW };
    const prior = { x: left + potW + gap, w: probW };
    const post = { x: prior.x + probW + gap, w: probW };
    const opt = { x: post.x + probW + gap, w: probW };
    return { top, bottom, rowsH, rowH, barH, rowY, rowAt, pot, prior, post, opt };
}

// Column titles: symbol on one line, gray word beneath.
const TITLES = {
    pot: { parts: [{ text: 'r', font: IT }], word: 'potential' },
    prior: { parts: [{ text: 'p', font: IT }], word: 'prior' },
    post: {
        parts: [{ text: 'π', font: IT, color: 'rgb(41, 128, 185)' }],
        word: 'posterior',
    },
    opt: {
        parts: [
            { text: 'q', font: IT },
            { text: '★', font: '7px Georgia, serif', dy: -6 },
            { text: 'β', font: IT_SM, dy: 3 },
        ],
        word: 'optimum',
    },
};

function drawTitle(ctx, L, P, key) {
    const t = TITLES[key];
    const cx = P.x + P.w / 2;
    drawLabel(ctx, cx, L.top - 20, t.parts);
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t.word, cx, L.top - 8);
}

function drawBaseline(ctx, L, P) {
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, L.top);
    ctx.lineTo(P.x, L.top + L.rowsH);
    ctx.stroke();
}

function xTick(ctx, L, x, label, align = 'center') {
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, L.top + L.rowsH);
    ctx.lineTo(x, L.top + L.rowsH + 4);
    ctx.stroke();
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#888';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, L.top + L.rowsH + 6);
}

// --- Probability column (horizontal bars) ---
// opts: { colors: per-row css colors, xmax, title: key in TITLES,
//         handles: bool (draggable bar tips) }

export function drawHBarCol(ctx, L, P, values, opts) {
    const k = values.length;
    drawBaseline(ctx, L, P);
    drawTitle(ctx, L, P, opts.title);
    xTick(ctx, L, P.x, '0', 'left');
    xTick(ctx, L, P.x + P.w, fmtTick(opts.xmax), 'right');

    // dashed reference at the uniform distribution
    if (opts.uniformRef !== false && 1 / k <= opts.xmax) {
        const xU = P.x + (1 / k / opts.xmax) * P.w;
        ctx.save();
        ctx.strokeStyle = '#ccc';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(xU, L.top);
        ctx.lineTo(xU, L.top + L.rowsH);
        ctx.stroke();
        ctx.restore();
        if (opts.title === 'prior') {
            ctx.font = 'italic 9px Georgia, serif';
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('1/K', xU, L.top + L.rowsH + 6);
        }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x, L.top, P.w, L.rowsH); // clip bars that outgrow a frozen scale
    ctx.clip();
    values.forEach((v, i) => {
        const cy = L.rowY(i);
        const len = (v / opts.xmax) * P.w;
        const color = opts.colors[i];
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(P.x, cy - L.barH / 2, len, L.barH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(P.x, cy - L.barH / 2, len, L.barH);
        if (opts.handles) {
            // thicker bar tip as drag affordance
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(P.x + len, cy - L.barH / 2);
            ctx.lineTo(P.x + len, cy + L.barH / 2);
            ctx.stroke();
        }
    });
    ctx.restore();
}

// --- Potential column ---
// Binary values: a full-length bar for r = 1 (valid, blue), a short red
// stub at zero for r = 0 (invalid). Click or drag-paint to toggle.

export function drawPotentialCol(ctx, L, P, valid, colors) {
    drawBaseline(ctx, L, P);
    drawTitle(ctx, L, P, 'pot');
    xTick(ctx, L, P.x, '0', 'left');
    xTick(ctx, L, P.x + P.w, '1', 'right');

    valid.forEach((isValid, i) => {
        const cy = L.rowY(i);
        const color = isValid ? colors.valid : colors.invalid;
        if (isValid) {
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.45;
            ctx.fillRect(P.x, cy - L.barH / 2, P.w, L.barH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(P.x, cy - L.barH / 2, P.w, L.barH);
        } else {
            // a zero-length bar: a red stub at the baseline
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(P.x + 1.5, cy - L.barH / 2);
            ctx.lineTo(P.x + 1.5, cy + L.barH / 2);
            ctx.stroke();
        }
    });
}

// --- Margin plot: alpha_beta as a function of beta ---
// The x-axis is the beta slider's log coordinate f in [0, 1] (with the
// endpoints meaning beta = 0 and beta = infinity), so the plot and the
// slider line up conceptually. data:
//   curve  — [{f, a}] the exact alpha_beta
//   approx — [{f, a}] the small-beta approximation, or null
//   Z      — prior mass of the valid set (the beta -> infinity asymptote)
//   dot    — {f, a} the currently selected beta
//   dotColor — css color for the dot
// Returns { dot: {x, y}, fOfX } for hit-testing/dragging the dot.

export function drawAlphaCurve(ctx, w, h, data) {
    const left = 18, right = 6, top = 8, bottom = 16;
    const P = { x: left, y: top, w: w - left - right, h: h - top - bottom };
    if (P.w < 20 || P.h < 20) return null;
    const xOf = f => P.x + f * P.w;
    const yOf = a => P.y + (1 - a) * P.h;

    // frame: alpha = 0 baseline and alpha = 1 reference
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    [0, 1].forEach(a => {
        ctx.beginPath();
        ctx.moveTo(P.x, yOf(a));
        ctx.lineTo(P.x + P.w, yOf(a));
        ctx.stroke();
    });

    // dashed asymptote at Z
    const showZ = data.Z > 0 && data.Z < 1;
    if (showZ) {
        ctx.save();
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(P.x, yOf(data.Z));
        ctx.lineTo(P.x + P.w, yOf(data.Z));
        ctx.stroke();
        ctx.restore();
    }

    // tiny axis labels
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', P.x - 3, yOf(1));
    ctx.fillText('0', P.x - 3, yOf(0));
    if (showZ && yOf(data.Z) - yOf(1) > 9 && yOf(0) - yOf(data.Z) > 9) {
        ctx.font = 'italic 9px Georgia, serif';
        ctx.fillText('Z', P.x - 3, yOf(data.Z));
        ctx.font = '9px ' + SANS;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xy = P.y + P.h + 3;
    ctx.fillText('0', xOf(0), xy);
    ctx.fillText('1', xOf(0.5), xy);
    ctx.fillText('∞', xOf(1), xy);
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillText('β', xOf(0.75), xy);

    const drawPath = pts => {
        ctx.beginPath();
        pts.forEach((p, i) => {
            if (i === 0) ctx.moveTo(xOf(p.f), yOf(p.a));
            else ctx.lineTo(xOf(p.f), yOf(p.a));
        });
        ctx.stroke();
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x, P.y - 1, P.w, P.h + 2); // clip the approx where it fails
    ctx.clip();
    if (data.approx) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        drawPath(data.approx);
        ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    drawPath(data.curve);
    ctx.restore();

    if (data.dot) {
        ctx.fillStyle = data.dotColor || '#444';
        ctx.beginPath();
        ctx.arc(xOf(data.dot.f), yOf(data.dot.a), 3.2, 0, 2 * Math.PI);
        ctx.fill();
    }

    return {
        dot: data.dot ? { x: xOf(data.dot.f), y: yOf(data.dot.a) } : null,
        fOfX: x => Math.max(0, Math.min(1, (x - P.x) / P.w)),
    };
}

// --- f plot: the reduced objective and its derivative over alpha ---
// Two stacked panels sharing one alpha axis in [0, 1]: f(alpha) on top,
// f'(alpha) below. The f window shows the valley: from the minimum up to
// FP_WINDOW nats above it (f explodes at alpha -> 0, so a full-range
// y-axis would flatten the interesting region); the f' window spans the
// slopes at the two edges of that visible valley, so both panels always
// describe the same stretch of curve. Curves are clipped to their panels
// like the margin plot's approx curve. data:
//   fCurve, fpCurve     — [{a, y}] samples, a increasing, strictly in (0,1)
//   Z                   — light dashed reference through both panels
//   alpha               — the minimizer alpha_beta (dashed line + dots)
//   fAtAlpha, fpAtAlpha — exact dot heights
//   fLabel, fpLabel     — panel labels ('f'/'f′'; 'f∕β'/'f′∕β' at beta = ∞)
//   dotColor            — css color for the marker dots
// Returns { dots, alphaOfX } for hit-testing/dragging the marker.

const FP_WINDOW = 3; // nats of f shown above its minimum

export function drawFPlot(ctx, w, h, data) {
    const left = 34, right = 10, top = 8, bottom = 20, gap = 16;
    const W = w - left - right;
    const H = h - top - bottom - gap;
    if (W < 40 || H < 60) return null;
    const fh = Math.round(H * 0.55);
    const F = { y: top, h: fh };            // f panel
    const D = { y: top + fh + gap, h: H - fh }; // f' panel
    const xOf = a => left + Math.max(0, Math.min(1, a)) * W;

    // y-window for f: the valley, from the minimum up to FP_WINDOW nats
    // (or the curve's own max, if it never rises that far)
    const ys = data.fCurve.map(p => p.y).filter(Number.isFinite);
    if (!ys.length) return null; // no finite samples: nothing to draw
    const fmin = Math.min(...ys);
    const fmax = Math.max(fmin + 1e-6,
        Math.min(Math.max(...ys), fmin + FP_WINDOW));
    // alpha-extent of the visible valley; f' spans its slopes
    const vis = data.fCurve.filter(p => p.y <= fmax);
    const nearest = (curve, a) => curve.reduce((b, p) =>
        Math.abs(p.a - a) < Math.abs(b.a - a) ? p : b);
    let pLo = nearest(data.fpCurve, vis[0].a).y;
    let pHi = nearest(data.fpCurve, vis[vis.length - 1].a).y;
    if (!(pHi - pLo > 1e-6)) { pLo -= 1; pHi += 1; } // degenerate window
    const yF = v => F.y + ((fmax - v) / (fmax - fmin)) * F.h;
    const yD = v => D.y + ((pHi - v) / (pHi - pLo)) * D.h;

    // spines: light left edge per panel, alpha axis under the lower one
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    [F, D].forEach(P => {
        ctx.beginPath();
        ctx.moveTo(left, P.y);
        ctx.lineTo(left, P.y + P.h);
        ctx.stroke();
    });
    ctx.strokeStyle = '#999';
    ctx.beginPath();
    ctx.moveTo(left, D.y + D.h);
    ctx.lineTo(left + W, D.y + D.h);
    ctx.stroke();

    // alpha ticks: 0, Z (italic), 1, plus the axis name
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = D.y + D.h + 5;
    ctx.fillText('0', xOf(0), ty);
    ctx.fillText('1', xOf(1), ty);
    ctx.font = 'italic 9px Georgia, serif';
    ctx.fillText('Z', xOf(data.Z), ty);
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillText('α', xOf(0.5), ty);

    // panel labels in the left margin
    drawLabel(ctx, left - 18, F.y + 12, [{ text: data.fLabel, font: IT }]);
    drawLabel(ctx, left - 18, D.y + 12, [{ text: data.fpLabel, font: IT }]);

    // light dashed vertical at Z through both panels
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.Z), F.y);
    ctx.lineTo(xOf(data.Z), D.y + D.h);
    ctx.stroke();
    ctx.restore();

    // dashed zero line in the f' panel, when zero is in the window
    if (pLo < 0 && pHi > 0) {
        ctx.save();
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(left, yD(0));
        ctx.lineTo(left + W, yD(0));
        ctx.stroke();
        ctx.restore();
        ctx.font = '9px ' + SANS;
        ctx.fillStyle = '#999';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('0', left - 4, yD(0));
    }

    // dashed vertical at the minimizer, through both panels
    ctx.save();
    ctx.strokeStyle = '#aaa';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.alpha), F.y);
    ctx.lineTo(xOf(data.alpha), D.y + D.h);
    ctx.stroke();
    ctx.restore();

    // the curves, clipped to their panels
    const drawCurve = (pts, yMap, P) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, P.y - 1, W, P.h + 2);
        ctx.clip();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let pen = false;
        pts.forEach(p => {
            if (!Number.isFinite(p.y)) { pen = false; return; }
            const x = xOf(p.a), y = yMap(p.y);
            if (!pen) { ctx.moveTo(x, y); pen = true; }
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
    };
    drawCurve(data.fCurve, yF, F);
    drawCurve(data.fpCurve, yD, D);

    // marker dots at (alpha, f) and (alpha, f'), clamped into the panels
    const clampY = (y, P) => Math.max(P.y, Math.min(P.y + P.h, y));
    const dots = [
        { x: xOf(data.alpha), y: clampY(yF(data.fAtAlpha), F) },
        { x: xOf(data.alpha), y: clampY(yD(data.fpAtAlpha), D) },
    ];
    ctx.fillStyle = data.dotColor || '#444';
    dots.forEach(d => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3.2, 0, 2 * Math.PI);
        ctx.fill();
    });

    return {
        dots,
        alphaOfX: x => Math.max(0, Math.min(1, (x - left) / W)),
    };
}

// --- Reshaping curve: the softened potential over the raw potential ---
// The continuous-case analogue of the segment diagram. The anchored
// optimum is q* = p · r(φ) for one increasing ratio curve r, so up to
// normalization it is the exact posterior for the softened potential
// φ̃(φ) = r(φ)/r(1) ∈ (0, 1]: the identity at beta = 0, flat 1 at
// beta = ∞, floored at φ̃(0) = ε_β. data:
//   curve — [{x, y}] samples of φ̃ over x in [0, 1], x increasing
//   eps   — the floor φ̃(0) (dashed reference, skipped when ≈ 1)
//   dots  — [{x, y, color}] the configured potential values on the curve
// Returns {} (nothing draggable here), or null if the area is too small.

export function drawReshapeCurve(ctx, w, h, data) {
    const left = 34, right = 14, top = 10, bottom = 22;
    const W = w - left - right, H = h - top - bottom;
    if (W < 40 || H < 40) return null;
    const xOf = x => left + x * W;
    const yOf = y => top + (1 - y) * H;

    // spines: left and bottom
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + H);
    ctx.lineTo(left + W, top + H);
    ctx.stroke();

    // ticks and axis labels: raw potential r along x, softened r-tilde up y
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = top + H + 5;
    ctx.fillText('0', xOf(0), ty);
    ctx.fillText('1', xOf(1), ty);
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('r', xOf(0.5), ty);
    ctx.font = '9px ' + SANS;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', left - 4, yOf(1));
    ctx.fillText('0', left - 4, yOf(0));
    drawLabel(ctx, left - 16, yOf(0.5) + 4, [
        { text: 'r̃', font: 'italic 11px Georgia, serif', color: '#999' },
    ]);

    // dashed identity diagonal: the beta -> 0 limit (exact conditioning)
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(1), yOf(1));
    ctx.stroke();
    ctx.restore();

    // dashed floor at eps, labeled in the right margin
    if (data.eps > 0.005 && data.eps < 0.995) {
        ctx.save();
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(left, yOf(data.eps));
        ctx.lineTo(left + W, yOf(data.eps));
        ctx.stroke();
        ctx.restore();
        ctx.font = 'italic 9px Georgia, serif';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ε', left + W + 4, yOf(data.eps));
    }

    // the softened-potential curve
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.curve.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.y));
        else ctx.lineTo(xOf(p.x), yOf(p.y));
    });
    ctx.stroke();

    // the configured potential values, as dots on the curve
    (data.dots || []).forEach(d => {
        ctx.fillStyle = d.color || '#444';
        ctx.beginPath();
        ctx.arc(xOf(d.x), yOf(d.y), 3, 0, 2 * Math.PI);
        ctx.fill();
    });

    return {};
}

// --- Segment diagram: the posterior–antiposterior chord ---
// A 1-D picture of the geometry: every anchored optimum lies on the
// segment between the posterior (mixture weight 1) and the antiposterior
// (weight 0). The posterior is drawn on the LEFT and the antiposterior on
// the right, so that raising beta moves the dot rightward, matching the
// beta slider's direction. The prior sits at weight Z; the optimum's dot
// slides in [Z, 1] and never passes the prior.
// data: { Z, alpha, dotColor, validColor, invalidColor }.
// Returns { dot: {x, y}, alphaOfX } for hit-testing/dragging the dot.

export function drawSegment(ctx, w, h, data) {
    const left = 40, right = 14;
    const x0 = left, x1 = w - right;
    if (x1 - x0 < 60) return null;
    const y = Math.round(h * 0.52);
    const xOf = a => x1 - a * (x1 - x0); // weight 1 (posterior) at the left
    const xZ = xOf(data.Z);

    // reachable stretch [Z, 1]: solid; unreachable [0, Z): light
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(xZ, y);
    ctx.stroke();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xZ, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    // endpoint ticks in the endpoint colors
    ctx.lineWidth = 2;
    [[x0, data.validColor], [x1, data.invalidColor]].forEach(([x, c]) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
    });

    // the prior's tick (at weight Z)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xZ, y - 6);
    ctx.lineTo(xZ, y + 6);
    ctx.stroke();

    // symbols row below the line: pi (posterior), p (prior), turned pi
    // (antiposterior)
    ctx.font = 'italic 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = data.validColor;
    ctx.fillText('π', x0, y + 18);
    const zClear = xZ - x0 > 14 && x1 - xZ > 14; // room for the p/Z labels
    if (zClear) {
        ctx.font = IT;
        ctx.fillStyle = '#555';
        ctx.fillText('p', xZ, y + 18);
    }
    ctx.save();
    ctx.translate(x1, y + 18);
    ctx.rotate(Math.PI);
    ctx.font = 'italic 15px Georgia, serif';
    ctx.fillStyle = data.invalidColor;
    ctx.fillText('π', 0, 1); // slight nudge so the rotated glyph sits level
    ctx.restore();

    // values row: the axis is the mixture weight alpha_beta, running from
    // 1 at the posterior end down to 0 at the antiposterior end
    const vy = y + 32;
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', x0, vy);
    ctx.fillText('0', x1, vy);
    if (zClear) {
        ctx.font = 'italic 9px Georgia, serif';
        ctx.fillText('Z', xZ, vy);
    }
    drawLabel(ctx, x0 - 20, vy + 3, [
        { text: 'α', font: 'italic 11px Georgia, serif', color: '#999' },
        { text: 'β', font: 'italic 8px Georgia, serif', dy: 2, color: '#999' },
        { text: ':', font: '9px ' + SANS, color: '#999' },
    ]);

    // the optimum: a dot at alpha, labeled above
    const xA = xOf(data.alpha);
    ctx.fillStyle = data.dotColor || '#444';
    ctx.beginPath();
    ctx.arc(xA, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    drawLabel(ctx, xA, y - 12, [
        { text: 'q', font: IT },
        { text: '★', font: '7px Georgia, serif', dy: -5 },
        { text: 'β', font: IT_SM, dy: 3 },
    ]);

    const clamp01 = v => Math.max(0, Math.min(1, v));
    return {
        dot: { x: xA, y },
        alphaOfX: x => clamp01((x1 - x) / (x1 - x0)),
    };
}
