// ================================================================
//  Differential entropy — ui.js
//  Number formatting for readouts, and the segmented family picker.
// ================================================================

import { log2 } from '../lib/prob/dist.js';

export const MINUS = '−';

// Fixed decimals, typographic minus, and no "−0.00".
export function fmt(v, d = 2) {
    if (!isFinite(v)) return v > 0 ? '∞' : MINUS + '∞';
    const s = Math.abs(v).toFixed(d);
    const neg = v < 0 && Number(s) !== 0;
    return (neg ? MINUS : '') + s;
}

// Write a signed value into a readout, flagging negatives.
export function setSigned(node, v, d = 2) {
    if (!node) return;
    node.textContent = fmt(v, d);
    node.classList.toggle('neg', v < 0 && Number(Math.abs(v).toFixed(d)) !== 0);
}

export function setText(node, s) {
    if (node) node.textContent = s;
}

// 2^-k for integer k > 0 as "1/2^k", otherwise ≤ 3 significant figures.
export function powLabel(v) {
    const k = Math.round(-log2(v));
    if (Math.abs(-log2(v) - k) < 1e-6 && k > 0) return '1/' + (2 ** k);
    return v < 1 ? v.toPrecision(2) : String(+v.toPrecision(3));
}

// A radiogroup of buttons (aria-checked), with arrow-key cycling.
export function segButtons(container, onChange) {
    if (!container) return;
    const btns = [...container.querySelectorAll('button')];
    btns.forEach(b => b.addEventListener('click', () => {
        btns.forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
        onChange(b.dataset.v);
    }));
    container.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const i = btns.findIndex(b => b.getAttribute('aria-checked') === 'true');
        const j = (i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
        btns[j].click();
        btns[j].focus();
        e.preventDefault();
    });
}
