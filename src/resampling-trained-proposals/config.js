// Shared visual constants.
export const LINEAGE_COLORS = [
    '#4269d0', '#efb118', '#ff725c', '#6cc5b0',
    '#3ca951', '#ff8ab7', '#a463f2', '#97bbf5',
    '#9c6b4e', '#9498a0', '#e4cf5b', '#c47b3c',
    '#5c8f9e', '#d05b8a', '#7aa874', '#8574c2',
];

export const COL = {
    axis: '#999',
    grid: '#eee',
    eventLine: '#c33',
    connector: 'rgba(0,0,0,0.25)',
    killMark: '#c33',
    validEnd: '#2a7a2a',
    invalidEnd: '#c33',
    sis: '#555',
    pt: '#c0392b',
    qt: '#2980b9',
};

export const S_GRID_MC = [0.0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0];

export function setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}
