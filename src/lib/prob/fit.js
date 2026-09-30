// ================================================================
//  Figures that fit their frame. A figure is laid out in viewBox
//  units, 1000 wide wherever there is room; in a narrower frame the
//  layout narrows instead (the horizontal axes compress), so it draws
//  at a fixed scale, with text and heights unchanged, and never needs
//  to scroll sideways.
// ================================================================

const FULL = 1000;  // the layout's width with room to spare
const SCALE = 0.64; // screen px per viewBox unit below that: the full layout in 640px
const FLOOR = 460;  // narrowest layout; a narrower frame scales it down

// The layout width for a frame cw px wide.
export function layoutWidth(cw) {
    return cw >= FULL * SCALE ? FULL : Math.max(FLOOR, Math.round(cw / SCALE));
}

// Calls onWidth(W) now and whenever the canvas's width changes the layout width.
// Also sets --ex-k on the canvas, the factor that keeps its math labels (sized in
// cqw) the same size in viewBox units whatever W is.
export function fitWidth(canvas, onWidth) {
    let W = 0;
    const apply = () => {
        const next = layoutWidth(canvas.clientWidth || FULL);
        if (next === W) return;
        W = next;
        canvas.style.setProperty('--ex-k', String(FULL / W));
        onWidth(W);
    };
    new ResizeObserver(apply).observe(canvas);
    apply();
}
