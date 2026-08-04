// ================================================================
//  Resampling vs trained proposals — simulate.js
//  Single-run simulator with full trajectory + genealogy recording
//  (panel 1), and batch Monte Carlo for the crossover (panel 2).
//
//  Arms: 'SIS' (never resample), 'PT' (prior-based intermediate
//  targets), 'QT' (proposal-based targets: increments are the
//  shaping ratio; the p0/q lump is realized at EOS).
// ================================================================

import { OPEN, CLOSE, EOS, clsOf, qMix } from './model.js';

export const TAU = 0.5;
export const T_MAX = 60;

// Small fast seeded RNG (mulberry32).
export function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function sampleTok(row, u) {
    return u < row[0] ? 0 : (u < row[0] + row[1] ? 1 : 2);
}

// One run with full history. Uses a shared token-uniform stream keyed by
// (t, slot) so PT/QT runs with the same seed see identical randomness until
// their genealogies diverge.
// Returns { steps, events, zhat, Z }, where
//   steps[t] = { depth, last, phase, w, tok } (arrays over slots, state AFTER step t)
//   events[] = { afterT, anc (ancestor index per pool slot), pool, wBefore }
export function runOne(P, s, arm, M, seed) {
    const { q, p0cls, Z } = qMix(P, s);
    const tokRand = rng(seed);           // token stream
    const resRand = rng(seed ^ 0x9E3779B9); // resampling stream
    // pre-draw token uniforms so both arms share them positionally
    const U = [];
    for (let t = 0; t < T_MAX; t++) {
        U.push(Array.from({ length: M }, () => tokRand()));
    }
    const depth = new Array(M).fill(0);
    const last = new Array(M).fill(0);
    const phase = new Array(M).fill(0); // 0 start 1 running 2 dead 3 completed
    const w = new Array(M).fill(1);
    const cumR = new Array(M).fill(0);
    const steps = [];
    const events = [];
    for (let t = 0; t < T_MAX; t++) {
        if (!phase.some(p => p <= 1)) break;
        const tok = new Array(M).fill(-1);
        for (let m = 0; m < M; m++) {
            if (phase[m] > 1) continue;
            const c = clsOf(phase[m], last[m], depth[m]);
            const x = sampleTok(q[c], U[t][m]);
            tok[m] = x;
            const r = q[c][x] > 0 ? p0cls[c][x] / q[c][x] : 1;
            if (arm === 'QT') cumR[m] += Math.log(r);
            else w[m] *= r;
            if (x === OPEN) {
                depth[m] += 1; last[m] = 0; phase[m] = 1;
            } else if (x === CLOSE) {
                if (depth[m] === 0) { phase[m] = 2; w[m] = 0; }
                else { depth[m] -= 1; last[m] = 1; }
            } else { // EOS
                const valid = phase[m] === 1 && depth[m] === 0;
                if (arm === 'QT') w[m] *= Math.exp(cumR[m]);
                phase[m] = 3;
                if (!valid) w[m] = 0;
            }
        }
        steps.push({ depth: depth.slice(), last: last.slice(), phase: phase.slice(), w: w.slice(), tok });
        if (arm === 'SIS') continue;
        // adaptive resampling among not-completed slots
        const pool = [];
        for (let m = 0; m < M; m++) if (phase[m] !== 3) pool.push(m);
        if (pool.length < 2) continue;
        let sw = 0, sw2 = 0;
        for (const m of pool) { sw += w[m]; sw2 += w[m] * w[m]; }
        if (sw <= 0) continue;
        const ess = sw * sw / sw2;
        if (ess >= TAU * pool.length) continue;
        const wBefore = pool.map(m => w[m]);
        const anc = pool.map(() => {
            let u = resRand() * sw, acc = 0;
            for (const m of pool) { acc += w[m]; if (u < acc) return m; }
            return pool[pool.length - 1];
        });
        const snap = { depth: depth.slice(), last: last.slice(), phase: phase.slice(), cumR: cumR.slice() };
        const wbar = sw / pool.length;
        pool.forEach((m, i) => {
            const a = anc[i];
            depth[m] = snap.depth[a]; last[m] = snap.last[a];
            phase[m] = snap.phase[a]; cumR[m] = snap.cumR[a];
            w[m] = wbar;
        });
        events.push({ afterT: t, pool, anc, wBefore });
        // patch the recorded step so drawing reflects post-event state at t
        // (kept separate: steps[t] stores pre-event state; events carry the map)
    }
    const zhat = w.reduce((a, b) => a + b, 0) / M;
    return { steps, events, zhat, Z };
}

// Batch runs for the crossover panel: relstd of Zhat.
export function crossoverPoint(P, s, arm, M, R, seedBase) {
    let sum = 0, sum2 = 0;
    let Z = null;
    for (let i = 0; i < R; i++) {
        const out = runOne(P, s, arm, M, (seedBase + i * 2654435761) >>> 0);
        Z = out.Z;
        sum += out.zhat; sum2 += out.zhat * out.zhat;
    }
    const mean = sum / R;
    const va = Math.max(0, sum2 / R - mean * mean);
    return { mean, relstd: Math.sqrt(va) / Z, se: Math.sqrt(va / R) / Z, Z };
}
