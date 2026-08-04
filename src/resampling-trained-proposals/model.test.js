import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORYLESS, UNIFORM, STICKY, twist, qstarTable, qMix, analyticSis, analyticSisRelstd } from './model.js';
import { runOne, crossoverPoint } from './simulate.js';

test('memoryless closed form: Z = 1/20, psi*(d) = 2^-d / 4, f = 1/2', () => {
    const { U, Z, f } = twist(MEMORYLESS);
    assert.ok(Math.abs(Z - 0.05) < 1e-12, `Z=${Z}`);
    assert.ok(Math.abs(f[0] - 0.5) < 1e-12 && Math.abs(f[1] - 0.5) < 1e-12);
    for (let d = 0; d <= 10; d++) {
        assert.ok(Math.abs(U[0][d] - 0.25 * Math.pow(2, -d)) < 1e-10);
        assert.ok(Math.abs(U[1][d] - 0.25 * Math.pow(2, -d)) < 1e-10);
    }
});

test('memoryless optimal proposal is the known 3-row table', () => {
    const { U } = twist(MEMORYLESS);
    const q = qstarTable(MEMORYLESS, U);
    assert.ok(Math.abs(q[0][0] - 1) < 1e-12);                       // start: must open
    for (const c of [1, 3]) {                                       // depth 0: .2 open / .8 eos
        assert.ok(Math.abs(q[c][0] - 0.2) < 1e-10 && Math.abs(q[c][2] - 0.8) < 1e-10);
    }
    for (const c of [2, 4]) {                                       // depth>=1: .2 open / .8 close
        assert.ok(Math.abs(q[c][0] - 0.2) < 1e-10 && Math.abs(q[c][1] - 0.8) < 1e-10);
    }
});

test('uniform prior: golden-ratio closed form', () => {
    const { U, Z, f } = twist(UNIFORM);
    const lam = (3 - Math.sqrt(5)) / 2;              // 1/phi^2
    assert.ok(Math.abs(f[1] - lam) < 1e-12, `f=${f[1]}`);
    assert.ok(Math.abs(Z - (lam - 1 / 3)) < 1e-12, `Z=${Z}`);
    for (let d = 0; d <= 8; d++) {                    // psi*(d) = lam^(d+1)
        assert.ok(Math.abs(U[0][d] - Math.pow(lam, d + 1)) < 1e-10);
    }
});

test('sticky bigram: closed form matches python-verified Z', () => {
    const { Z } = twist(STICKY);
    assert.ok(Math.abs(Z - 0.033130) < 1e-5, `Z=${Z}`);
});

test('analytic SIS variance is exactly zero at the optimal proposal', () => {
    for (const P of [MEMORYLESS, STICKY]) {
        const { q } = qMix(P, 1.0);
        const { Z, m2 } = analyticSis(P, q);
        assert.ok(Math.abs(m2 - Z * Z) < 1e-12);
        assert.ok(analyticSisRelstd(P, 1.0, 8) < 1e-6);
    }
});

test('weight identity: live PT/SIS weight equals Z / psi*(state) at s=1', () => {
    for (const P of [MEMORYLESS, STICKY]) {
        const { U, Z } = twist(P);
        const { steps } = runOne(P, 1.0, 'SIS', 8, 12345);
        for (const st of steps) {
            for (let m = 0; m < 8; m++) {
                if (st.phase[m] === 1) {
                    const expect = Z / U[st.last[m]][st.depth[m]];
                    assert.ok(Math.abs(st.w[m] - expect) < 1e-9,
                        `w=${st.w[m]} expect=${expect}`);
                }
            }
        }
    }
});

test('QT at s=1 is exact (every completed weight is Z); PT is not', () => {
    const qt = crossoverPoint(MEMORYLESS, 1.0, 'QT', 8, 500, 7);
    assert.ok(qt.relstd < 1e-9, `QT relstd=${qt.relstd}`);
    const pt = crossoverPoint(MEMORYLESS, 1.0, 'PT', 8, 500, 7);
    assert.ok(pt.relstd > 0.02, `PT relstd=${pt.relstd}`);
});

test('all arms unbiased (means within 5 SE of Z), and SIS matches analytic relstd', () => {
    for (const arm of ['SIS', 'PT', 'QT']) {
        const r = crossoverPoint(MEMORYLESS, 0.5, arm, 8, 4000, 99);
        assert.ok(Math.abs(r.mean - r.Z) < 5 * r.se * r.Z, `${arm}: mean=${r.mean}`);
    }
    const sis = crossoverPoint(MEMORYLESS, 0.5, 'SIS', 8, 6000, 3);
    const exact = analyticSisRelstd(MEMORYLESS, 0.5, 8);
    assert.ok(Math.abs(sis.relstd - exact) / exact < 0.08,
        `sim=${sis.relstd} exact=${exact}`);
});
