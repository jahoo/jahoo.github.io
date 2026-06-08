// ================================================================
//  Interactive divergence fitting — interaction.js
//  Pointer interaction: dragging the target mode peaks / fitted-q peak
//  on the distribution panels, dragging q on the loss landscape, and
//  the landscape hover tooltip. Mutates shared state (`S`); the
//  animation loop in main.js picks up the changes on the next frame.
// ================================================================

import { S, resetAdam } from './state.js';
import { LAND_RES_LO } from './config.js';
import { fmtNum, gaussPdf } from './mathutils.js';
import { curP, qToLand, setQFromLand } from './parameterizations.js';
import { computeOptimal, computeLandscapes } from './algorithms.js';
import { computeYMax, xToC, cToX, yToC } from './drawing.js';

// ===== Distribution-panel handles =====
function getHandles(canvas, q, optima) {
    const yMax = computeYMax(q, optima);
    const handles = [];
    for (const c of S.pComps) {
        handles.push({
            target: 'p', comp: c,
            cx: xToC(c.mu, canvas), cy: yToC(c.w * gaussPdf(c.mu, c.mu, c.sigma), canvas, yMax)
        });
    }
    handles.push({
        target: 'q', q: q,
        cx: xToC(q.mu, canvas), cy: yToC(gaussPdf(q.mu, q.mu, q.sigma), canvas, yMax)
    });
    return handles;
}

function hitTest(canvas, q, optima, mx, my) {
    const dpr = window.devicePixelRatio || 1;
    const handles = getHandles(canvas, q, optima);
    let best = null, bestD = 18 * dpr;
    for (const h of handles) {
        const d = Math.hypot(mx - h.cx, my - h.cy);
        if (d < bestD) { bestD = d; best = h; }
    }
    return best;
}

function getPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * dpr, y: (cy - rect.top) * dpr };
}

export function setupCanvas(canvas, q, getOptima) {
    function onDown(e) {
        e.preventDefault();
        const pos = getPos(canvas, e);
        const h = hitTest(canvas, q, getOptima(), pos.x, pos.y);
        if (h) {
            const startSigma = h.target === 'p' ? h.comp.sigma : h.q.sigma;
            S.dragState = { handle: h, canvas, startY: pos.y, startSigma };
            canvas.style.cursor = 'grabbing';
        }
    }
    function onMove(e) {
        const pos = getPos(canvas, e);
        if (S.dragState && S.dragState.canvas === canvas) {
            e.preventDefault();
            const dpr = window.devicePixelRatio || 1;
            const newMu = cToX(pos.x, canvas);
            const dy = pos.y - S.dragState.startY;
            const newSigma = Math.max(0.1, S.dragState.startSigma + dy / (150 * dpr));
            if (S.dragState.handle.target === 'p') {
                S.dragState.handle.comp.mu = newMu;
                S.dragState.handle.comp.sigma = newSigma;
                computeOptimal();
                computeLandscapes(LAND_RES_LO);
            } else {
                S.dragState.handle.q.mu = newMu;
                S.dragState.handle.q.logSigma = Math.log(newSigma);
            }
        } else {
            const h = hitTest(canvas, q, getOptima(), pos.x, pos.y);
            S.hoveredHandle = h;
            canvas.style.cursor = h ? 'grab' : 'crosshair';
        }
    }
    function onUp() {
        if (S.dragState) {
            S.dragState.canvas.style.cursor = 'crosshair';
            if (S.dragState.handle.target === 'p') { computeOptimal(); computeLandscapes(); }
            resetAdam();
            S.lastFwd = null; S.lastRev = null;
            S.dragState = null;
        }
    }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
}

// ===== Landscape hover tooltip =====
let _landTip = null;
function landTipEl() {
    if (!_landTip) _landTip = document.getElementById('land-tooltip');
    return _landTip;
}
function showTip(html, clientX, clientY) {
    const landTip = landTipEl();
    if (!landTip) return;
    landTip.innerHTML = html;
    landTip.style.display = 'block';
    // Position near cursor, then clamp to viewport
    let x = clientX + 14, y = clientY - 60;
    const w = landTip.offsetWidth, h = landTip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + w > vw - 4) x = clientX - w - 10;
    if (y < 4) y = 4;
    if (y + h > vh - 4) y = vh - h - 4;
    landTip.style.left = x + 'px';
    landTip.style.top = y + 'px';
}
function hideTip() {
    const landTip = landTipEl();
    if (landTip) landTip.style.display = 'none';
}

// ===== Landscape canvases: drag the purple circle to move q =====
export function setupLandscape(canvas, q, getGrid) {
    let landDrag = null;
    function getLandPos(e) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (cx - rect.left) * dpr, y: (cy - rect.top) * dpr, cx, cy };
    }
    function posToParams(pos) {
        const dpr = window.devicePixelRatio || 1;
        const margin = 25 * dpr;
        const plotW = canvas.width - margin;
        const plotH = canvas.height - margin;
        const a1 = S.landMuMin + (pos.x - margin) / plotW * (S.landMuMax - S.landMuMin);
        const a2 = S.landLsMax - pos.y / plotH * (S.landLsMax - S.landLsMin);
        return { a1, a2 };
    }
    function isNearQ(pos) {
        const dpr = window.devicePixelRatio || 1;
        const margin = 25 * dpr;
        const plotW = canvas.width - margin;
        const plotH = canvas.height - margin;
        const [qa1, qa2] = qToLand(q);
        const qx = margin + (qa1 - S.landMuMin) / (S.landMuMax - S.landMuMin) * plotW;
        const qy = (1 - (qa2 - S.landLsMin) / (S.landLsMax - S.landLsMin)) * plotH;
        return Math.hypot(pos.x - qx, pos.y - qy) < 15 * dpr;
    }
    function onDown(e) {
        const pos = getLandPos(e);
        if (isNearQ(pos)) {
            e.preventDefault();
            landDrag = true;
            S.landDragActive = true;
            canvas.style.cursor = 'grabbing';
        }
    }
    function onMove(e) {
        const pos = getLandPos(e);
        if (landDrag) {
            e.preventDefault();
            const p = posToParams(pos);
            const a1 = Math.max(S.landMuMin, Math.min(S.landMuMax, p.a1));
            const a2 = Math.max(S.landLsMin, Math.min(S.landLsMax, p.a2));
            setQFromLand(a1, a2, q);
        } else {
            canvas.style.cursor = isNearQ(pos) ? 'grab' : 'crosshair';
        }
    }
    // Tooltip on canvas hover (separate from window-level drag handler)
    function onHover(e) {
        const pos = getLandPos(e);
        const p = posToParams(pos);
        if (p.a1 >= S.landMuMin && p.a1 <= S.landMuMax && p.a2 >= S.landLsMin && p.a2 <= S.landLsMax) {
            const grid = getGrid();
            const fi = (p.a1 - S.landMuMin) / (S.landMuMax - S.landMuMin) * (S.landCurRes - 1);
            const fj = (p.a2 - S.landLsMin) / (S.landLsMax - S.landLsMin) * (S.landCurRes - 1);
            const i = Math.round(Math.max(0, Math.min(S.landCurRes - 1, fi)));
            const j = Math.round(Math.max(0, Math.min(S.landCurRes - 1, fj)));
            const kl = grid[j * S.landCurRes + i];
            const divLabel = S.divergenceType === 'chisq' ? 'χ²' : 'KL';
            const paramLabel = curP().hoverLabel(p.a1, p.a2);
            showTip(divLabel + ' = ' + fmtNum(kl) + '<br>' + paramLabel, pos.cx, pos.cy);
        }
    }
    canvas.addEventListener('mousemove', onHover);
    canvas.addEventListener('mouseleave', hideTip);
    function onUp() {
        if (landDrag) {
            landDrag = false;
            S.landDragActive = false;
            canvas.style.cursor = 'default';
            resetAdam();
            S.lastFwd = null; S.lastRev = null;
        }
    }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', function(e) {
        onDown(e);
        if (!landDrag) onMove(e);  // show tooltip on tap
    }, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', function() { onUp(); hideTip(); });
}
