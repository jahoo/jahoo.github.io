// ================================================================
//  What survives: for jointly Gaussian (X, Y) with correlation ρ,
//  stretching X moves h(aX) and h(aX | Y) together; I(aX; Y) stays.
// ================================================================

import { log2 } from './dist.js';
import { createPRNG } from '../lib/prng.js';
import { Plot, txt } from './svgplot.js';
import { fmt, setSigned, setText } from './ui.js';

const N_SAMPLES = 500;

// Standard normal pairs by Box–Muller, fixed seed so the cloud is stable.
function normalPairs(n, seed) {
    const { random } = createPRNG(seed);
    const Z = [];
    for (let i = 0; i < n; i++) {
        const u1 = Math.max(random(), 1e-12), u2 = random(), r = Math.sqrt(-2 * Math.log(u1));
        Z.push([r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]);
    }
    return Z;
}

export function initMI() {
    const svgSc = document.getElementById('de-e-sc');
    const svgBars = document.getElementById('de-e-bars');
    const sR = document.getElementById('de-e-rho');
    const sA = document.getElementById('de-e-a');
    if (!svgSc || !svgBars || !sR || !sA) return;
    const Z = normalPairs(N_SAMPLES, 20260928);
    const P1 = new Plot(svgSc, { w: 520, h: 320 });
    const P2 = new Plot(svgBars, { w: 520, h: 320, m: { l: 44, r: 14, t: 14, b: 44 } });
    const K = 0.5 * log2(2 * Math.PI * Math.E); // h of a unit-variance Gaussian

    function draw() {
        const rho = +sR.value, la = +sA.value, a = 2 ** la;
        setText(document.getElementById('de-e-rhov'), rho.toFixed(3).replace(/0$/, ''));
        setText(document.getElementById('de-e-av'), String(+a.toPrecision(3)));
        const c = Math.sqrt(1 - rho * rho); // sd of X given Y

        P1.domain(-9, 9, -3.6, 3.6);
        P1.axes({ xticks: [-8, -4, 0, 4, 8], yticks: [-3, -2, -1, 0, 1, 2, 3], xlabel: 'a·X', ylabel: 'Y' });
        // X = ρY + c·ε, so Var X = 1
        for (const [z1, z2] of Z) P1.circle(a * (rho * z1 + c * z2), z1, 2.1, 'sc');

        const hx = K + la, hxy = K + la + log2(c), I = -log2(c);
        P2.domain(0, 3, -6, 8);
        P2.axes({ xticks: [], yticks: [-6, -4, -2, 0, 2, 4, 6, 8], ylabel: 'bits' });
        const bar = (i, v, cls, label) => {
            P2.rect(i + .22, 0, i + .78, v, cls);
            txt(P2.back, P2.X(i + .5), P2.pb + 18, label, 'axl', { 'text-anchor': 'middle' });
            const y = v >= 0 ? P2.Y(Math.min(v, 8)) - 6 : P2.Y(Math.max(v, -6)) + 15;
            txt(P2.front, P2.X(i + .5), y, fmt(v), 'lbl b', { 'text-anchor': 'middle' });
        };
        bar(0, hx, hx >= 0 ? 'hbar pos' : 'hbar neg', 'h(aX)');
        bar(1, hxy, hxy >= 0 ? 'hbar pos' : 'hbar neg', 'h(aX | Y)');
        bar(2, I, 'hbar mi', 'I(aX; Y)');
        // bracket showing the difference
        const bx = 1.86;
        P2.line(bx, hxy, bx, hx, 'brk');
        P2.line(0.78, hx, bx, hx, 'ref');
        P2.line(1.78, hxy, bx, hxy, 'ref');

        setSigned(document.getElementById('de-e-hx'), hx, 3);
        setSigned(document.getElementById('de-e-hxy'), hxy, 3);
        setText(document.getElementById('de-e-I'), I.toFixed(3));
    }

    sR.addEventListener('input', draw);
    sA.addEventListener('input', draw);
    draw();
}
