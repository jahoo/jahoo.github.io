import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { temper, normalize, isNegativeTemp, truncateTopP } from './model.js';

// Helper: sum of an array
const sum = (a) => a.reduce((x, y) => x + y, 0);

// Helper: assert two arrays elementwise-close
const assertClose = (actual, expected, tol = 1e-12) => {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) {
        assert.ok(Math.abs(actual[i] - expected[i]) < tol,
            `index ${i}: ${actual[i]} vs ${expected[i]}`);
    }
};

describe('normalize', () => {
    it('returns a new array summing to 1', () => {
        const p = normalize([1, 2, 3, 4]);
        assert.ok(Math.abs(sum(p) - 1.0) < 1e-12);
    });

    it('preserves relative proportions', () => {
        const p = normalize([2, 4, 6]);
        assertClose(p, [1 / 6, 2 / 6, 3 / 6]);
    });
});

describe('temper', () => {
    const base = normalize([0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]);

    it('is the identity at T = 1', () => {
        assertClose(temper(base, 1), base);
    });

    it('always returns a normalized distribution', () => {
        for (const T of [0, 0.1, 0.5, 1, 2, 10, Infinity]) {
            const p = temper(base, T);
            assert.ok(Math.abs(sum(p) - 1.0) < 1e-12, `T=${T}: sum ${sum(p)}`);
        }
    });

    it('puts all mass on the argmax as T -> 0', () => {
        const p = temper(base, 0);
        const expected = base.map(v => (v === 0.30 ? 1 : 0));
        assertClose(p, expected);
    });

    it('splits mass evenly over tied argmaxes at T = 0', () => {
        const p = temper([0.4, 0.4, 0.2], 0);
        assertClose(p, [0.5, 0.5, 0]);
    });

    it('is uniform over the support as T -> Infinity', () => {
        const p = temper(base, Infinity);
        assertClose(p, new Array(8).fill(1 / 8));
    });

    it('is uniform only over nonzero entries at T = Infinity', () => {
        const p = temper([0.5, 0.5, 0], Infinity);
        assertClose(p, [0.5, 0.5, 0]);
    });

    it('preserves zeros at every finite temperature', () => {
        for (const T of [0, 0.5, 1, 3]) {
            const p = temper([0.7, 0.3, 0], T);
            assert.equal(p[2], 0, `T=${T}`);
        }
    });

    it('sharpens for T < 1 (max grows, min shrinks)', () => {
        const p = temper(base, 0.5);
        assert.ok(Math.max(...p) > Math.max(...base));
        assert.ok(Math.min(...p) < Math.min(...base));
    });

    it('flattens for T > 1 (max shrinks, min grows)', () => {
        const p = temper(base, 2);
        assert.ok(Math.max(...p) < Math.max(...base));
        assert.ok(Math.min(...p) > Math.min(...base));
    });

    it('preserves the ranking of probabilities at any T', () => {
        for (const T of [0.3, 1.7, 5]) {
            const p = temper(base, T);
            for (let i = 0; i < base.length; i++) {
                for (let j = 0; j < base.length; j++) {
                    if (base[i] < base[j]) {
                        assert.ok(p[i] < p[j], `T=${T}: order of ${i},${j}`);
                    }
                }
            }
        }
    });

    it('matches the explicit power formula p_i^(1/T) / Z', () => {
        const T = 0.7;
        const pow = base.map(v => Math.pow(v, 1 / T));
        const expected = pow.map(v => v / sum(pow));
        assertClose(temper(base, T), expected);
    });

    it('does not mutate its input', () => {
        const p = [0.2, 0.3, 0.5];
        temper(p, 0.5);
        assert.deepStrictEqual(p, [0.2, 0.3, 0.5]);
    });

    it('handles very peaked inputs at small T without NaN (log-space stability)', () => {
        const p = temper(normalize([1e-300, 1, 1e-300]), 0.01);
        assert.ok(p.every(Number.isFinite));
        assert.ok(Math.abs(sum(p) - 1.0) < 1e-12);
    });
});

describe('truncateTopP', () => {
    it('is the identity at rho = 1', () => {
        const p = [0.5, 0.3, 0.2];
        assertClose(truncateTopP(p, 1), p);
    });

    it('keeps the smallest prefix (by descending prob) with mass >= rho', () => {
        // 0.5 < 0.6, so the nucleus is {0.5, 0.3}; 0.2 is zeroed
        assertClose(truncateTopP([0.5, 0.3, 0.2], 0.6), [0.625, 0.375, 0]);
    });

    it('keeps only the argmax when rho <= the max probability', () => {
        assertClose(truncateTopP([0.5, 0.3, 0.2], 0.5), [1, 0, 0]);
        assertClose(truncateTopP([0.5, 0.3, 0.2], 0.1), [1, 0, 0]);
    });

    it('breaks ties at the cutoff deterministically by lower index', () => {
        // 0.4 + first 0.3 reaches 0.5; the tied 0.3 at index 2 is dropped
        assertClose(truncateTopP([0.4, 0.3, 0.3], 0.5), [0.4 / 0.7, 0.3 / 0.7, 0]);
        // same probabilities, tied pair first: index 0 wins the tie
        assertClose(truncateTopP([0.3, 0.3, 0.4], 0.5), [0.3 / 0.7, 0, 0.4 / 0.7]);
    });

    it('truncates by value, not position', () => {
        assertClose(truncateTopP([0.2, 0.5, 0.3], 0.6), [0, 0.625, 0.375]);
    });

    it('always returns a normalized distribution', () => {
        for (const rho of [0.05, 0.3, 0.7, 1]) {
            const q = truncateTopP([0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05], rho);
            assert.ok(Math.abs(sum(q) - 1) < 1e-12, `rho=${rho}`);
        }
    });

    it('preserves zeros and does not mutate its input', () => {
        const p = [0.7, 0.3, 0];
        const q = truncateTopP(p, 0.95);
        assert.equal(q[2], 0);
        assert.deepStrictEqual(p, [0.7, 0.3, 0]);
    });
});

describe('isNegativeTemp', () => {
    it('is true for negative temperatures including the -0 and -Infinity limits', () => {
        for (const t of [-0, -0.5, -1, -Infinity]) {
            assert.equal(isNegativeTemp(t), true, `t=${t}`);
        }
    });

    it('is false for nonnegative temperatures including the 0 and Infinity limits', () => {
        for (const t of [0, 0.5, 1, Infinity]) {
            assert.equal(isNegativeTemp(t), false, `t=${t}`);
        }
    });
});

describe('temper at negative temperature', () => {
    const base = normalize([0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]);

    it('matches the explicit power formula p_i^(1/T) / Z at T = -1', () => {
        const pow = base.map(v => 1 / v);
        const expected = pow.map(v => v / sum(pow));
        assertClose(temper(base, -1), expected);
    });

    it('reverses the ranking of probabilities for any T < 0', () => {
        for (const T of [-0.3, -1, -5]) {
            const p = temper(base, T);
            for (let i = 0; i < base.length; i++) {
                for (let j = 0; j < base.length; j++) {
                    if (base[i] < base[j]) {
                        assert.ok(p[i] > p[j], `T=${T}: order of ${i},${j}`);
                    }
                }
            }
        }
    });

    it('always returns a normalized distribution', () => {
        for (const T of [-0, -0.1, -1, -10, -Infinity]) {
            const p = temper(base, T);
            assert.ok(Math.abs(sum(p) - 1.0) < 1e-12, `T=${T}: sum ${sum(p)}`);
        }
    });

    it('puts all mass on the argmin as T -> -0', () => {
        const p = temper(base, -0);
        const expected = base.map(v => (v === base[0] ? 0.5 : 0)); // 0.05 tied at i=0,7
        assertClose(p, expected);
    });

    it('takes the argmin over the support (zeros excluded) at T = -0', () => {
        const p = temper([0.7, 0.3, 0], -0);
        assertClose(p, [0, 1, 0]);
    });

    it('is uniform over the support as T -> -Infinity', () => {
        const p = temper(base, -Infinity);
        assertClose(p, new Array(8).fill(1 / 8));
    });

    it('preserves zeros at negative T (reversal over the support)', () => {
        const p = temper([0.7, 0.3, 0], -1);
        const pow = [1 / 0.7, 1 / 0.3];
        const z = sum(pow);
        assertClose(p, [pow[0] / z, pow[1] / z, 0]);
    });

    it('still treats positive T = 0 as argmax (not argmin)', () => {
        const p = temper([0.5, 0.3, 0.2], 0);
        assertClose(p, [1, 0, 0]);
    });
});
