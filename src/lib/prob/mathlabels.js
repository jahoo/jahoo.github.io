// ================================================================
//  Math labels for SVG figures, typeset by the page's MathJax.
//  An HTML layer sits exactly over the figure's SVG. Each label is
//  placed in viewBox coordinates (as percentages, so it follows the
//  figure's scaling) and sized in container units (1cqw = 1/100 of the
//  figure's width), matching SVG text of the same viewBox size.
//  A label is re-typeset only when its TeX changes, and the new
//  rendering replaces the old one only once it is ready, so a label
//  that changes during a drag never shows its TeX source.
// ================================================================

// Resolves once MathJax has started (it loads asynchronously).
function mathJaxReady() {
    return new Promise(resolve => {
        const poll = () => (window.MathJax?.startup?.promise ? window.MathJax.startup.promise.then(resolve) : setTimeout(poll, 50));
        poll();
    });
}

let chain = Promise.resolve(); // MathJax typesetting calls must not overlap

// canvas: the positioned element holding the SVG; W, H: the SVG's viewBox size.
export function createMathLayer(canvas, W, H) {
    const layer = document.createElement('div');
    layer.className = 'ex-math-layer';
    canvas.appendChild(layer);
    const labels = new Map();
    let used = new Set();

    function render(L, tex) {
        L.want = tex;
        if (L.busy) return; // the latest wanted TeX is typeset when the current one finishes
        L.busy = true;
        const next = document.createElement('span');
        next.className = 'ex-ml-body';
        next.style.visibility = 'hidden';
        next.textContent = L.text ? tex : `\\(${tex}\\)`; // prose carries its own \( \)
        L.el.appendChild(next);
        chain = chain.then(mathJaxReady).then(() => window.MathJax.typesetPromise([next])).then(() => {
            for (const old of [...L.el.children]) if (old !== next) { window.MathJax.typesetClear?.([old]); old.remove(); }
            next.style.visibility = '';
            L.shown = tex;
        }).catch(() => {}).finally(() => {
            L.busy = false;
            if (L.want !== L.shown) render(L, L.want);
        });
    }

    // Place (or move) the label `key` with its anchor at viewBox point (x, y).
    // opts: { anchor: 'start' | 'middle' | 'end', rotate: degrees, cls, bottom: y is the label's bottom edge,
    //         text: the label is prose with inline \( \) math, wrapped to width (viewBox units) }
    function set(key, x, y, tex, opts = {}) {
        used.add(key);
        let L = labels.get(key);
        if (!L) {
            const el = document.createElement('div');
            layer.appendChild(el);
            L = { el, want: null, shown: null, busy: false };
            labels.set(key, L);
        }
        const { anchor = 'middle', rotate = 0, cls = '', text = false, width = 0, bottom = false } = opts;
        L.text = text;
        L.el.style.width = width ? (width / W * 100) + '%' : '';
        const tx = anchor === 'start' ? '0' : anchor === 'end' ? '-100%' : '-50%';
        L.el.className = 'ex-ml' + (cls ? ' ' + cls : '');
        L.el.style.left = (x / W * 100) + '%';
        L.el.style.top = (y / H * 100) + '%';
        L.el.style.transformOrigin = anchor === 'start' ? 'left center' : anchor === 'end' ? 'right center' : 'center';
        L.el.style.transform = `translate(${tx}, ${bottom ? '-100%' : '-50%'})` + (rotate ? ` rotate(${rotate}deg)` : '');
        L.el.hidden = false;
        if (tex !== L.want) render(L, tex);
    }

    // Call around each redraw: labels not set since begin() are hidden.
    return {
        set,
        begin() { used = new Set(); },
        // the SVG's viewBox changed size: labels placed from now on use the new one
        resize(w, h) { W = w; H = h; },
        end() { for (const [k, L] of labels) if (!used.has(k)) L.el.hidden = true; },
    };
}

// A number for TeX: fixed decimals, ASCII minus (TeX sets it as a proper minus), no −0.
export function texNum(v, d = 3) {
    if (!isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && Number(s) !== 0 ? '-' : '') + s;
}
