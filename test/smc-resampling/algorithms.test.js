import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { withSeed } from '../../src/lib/prng.js';
import {
    cumulativeSum,
    normalize,
    countIndices,
    searchSorted,
    resample,
    runTrials,
    evalEstimators,
    getTestFnValues,
    setTestFnKey,
} from '../../src/smc-resampling/algorithms.js';
import { N } from '../../src/smc-resampling/config.js';

// Helper: uniform weights
const uniform = () => new Array(N).fill(1 / N);

// Helper: skewed weights
const skewed = () => {
    const w = [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05];
    const s = w.reduce((a, b) => a + b, 0);
    return w.map(v => v / s);
};

describe('cumulativeSum', () => {
    it('computes prefix sums correctly', () => {
        const result = cumulativeSum([1, 2, 3, 4]);
        assert.deepStrictEqual(result, [1, 3, 6, 10]);
    });

    it('works for single element', () => {
        assert.deepStrictEqual(cumulativeSum([5]), [5]);
    });

    it('preserves floating point for weights', () => {
        const w = [0.25, 0.25, 0.25, 0.25];
        const cs = cumulativeSum(w);
        assert.ok(Math.abs(cs[3] - 1.0) < 1e-12);
    });
});

describe('normalize', () => {
    it('produces weights summing to 1', () => {
        const w = [1, 2, 3, 4];
        normalize(w);
        const sum = w.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1.0) < 1e-12,
            `sum ${sum} should be 1.0`);
    });

    it('preserves relative proportions', () => {
        const w = [2, 4, 6];
        normalize(w);
        assert.ok(Math.abs(w[0] - 1 / 6) < 1e-12);
        assert.ok(Math.abs(w[1] - 2 / 6) < 1e-12);
        assert.ok(Math.abs(w[2] - 3 / 6) < 1e-12);
    });

    it('handles all-zero array (no-op)', () => {
        const w = [0, 0, 0];
        normalize(w);
        assert.deepStrictEqual(w, [0, 0, 0]);
    });
});

describe('countIndices', () => {
    it('counts occurrences correctly', () => {
        const counts = countIndices([0, 1, 1, 2, 2, 2], 4);
        assert.deepStrictEqual(counts, [1, 2, 3, 0]);
    });

    it('returns all zeros for empty array', () => {
        assert.deepStrictEqual(countIndices([], 3), [0, 0, 0]);
    });
});

describe('searchSorted', () => {
    it('finds correct bin in CDF', () => {
        const cs = [0.25, 0.5, 0.75, 1.0];
        assert.strictEqual(searchSorted(cs, 0.1), 0);
        assert.strictEqual(searchSorted(cs, 0.3), 1);
        assert.strictEqual(searchSorted(cs, 0.5), 1);
        assert.strictEqual(searchSorted(cs, 0.75), 2);
        assert.strictEqual(searchSorted(cs, 0.9), 3);
    });

    it('clamps to last index for u=1', () => {
        const cs = [0.25, 0.5, 0.75, 1.0];
        assert.strictEqual(searchSorted(cs, 1.0), 3);
    });
});

describe('resample', () => {
    // These methods always produce exactly N outputs
    const exactMethods = ['multinomial', 'stratified', 'systematic'];

    for (const name of exactMethods) {
        describe(name, () => {
            it('returns indices that sum to N for uniform weights', () => {
                withSeed(42, () => {
                    const w = uniform();
                    const idx = resample[name](w);
                    const counts = countIndices(idx, N);
                    const total = counts.reduce((a, b) => a + b, 0);
                    assert.strictEqual(total, N,
                        `${name}: count sum ${total} should equal N=${N}`);
                });
            });

            it('returns indices that sum to N for skewed weights', () => {
                withSeed(123, () => {
                    const w = skewed();
                    const idx = resample[name](w);
                    const counts = countIndices(idx, N);
                    const total = counts.reduce((a, b) => a + b, 0);
                    assert.strictEqual(total, N,
                        `${name}: count sum ${total} should equal N=${N}`);
                });
            });

            it('all indices are in [0, N)', () => {
                withSeed(99, () => {
                    const w = skewed();
                    const idx = resample[name](w);
                    for (const i of idx) {
                        assert.ok(i >= 0 && i < N,
                            `${name}: index ${i} out of range`);
                    }
                });
            });
        });
    }

    describe('branchkill', () => {
        it('produces approximately N indices on average', () => {
            const w = skewed();
            const K = 1000;
            let totalCount = 0;
            withSeed(42, () => {
                for (let t = 0; t < K; t++) {
                    totalCount += resample.branchkill(w).length;
                }
            });
            const avgCount = totalCount / K;
            assert.ok(Math.abs(avgCount - N) < 0.5,
                `branchkill: avg count ${avgCount.toFixed(2)} should be close to N=${N}`);
        });

        it('all indices are in [0, N)', () => {
            withSeed(99, () => {
                const w = skewed();
                const idx = resample.branchkill(w);
                for (const i of idx) {
                    assert.ok(i >= 0 && i < N,
                        `branchkill: index ${i} out of range`);
                }
            });
        });
    });

    describe('residual', () => {
        for (const phase2 of ['multinomial', 'stratified', 'systematic']) {
            it(`returns counts summing to N with phase2=${phase2}`, () => {
                withSeed(77, () => {
                    const w = skewed();
                    const idx = resample.residual(w, phase2);
                    const counts = countIndices(idx, N);
                    const total = counts.reduce((a, b) => a + b, 0);
                    assert.strictEqual(total, N,
                        `residual(${phase2}): count sum ${total} should equal N=${N}`);
                });
            });
        }
    });

    describe('multinomial unbiasedness', () => {
        it('mean counts approximate N * weights over many trials', () => {
            const w = skewed();
            const K = 5000;
            const sums = new Array(N).fill(0);
            withSeed(42, () => {
                for (let t = 0; t < K; t++) {
                    const idx = resample.multinomial(w);
                    const c = countIndices(idx, N);
                    for (let i = 0; i < N; i++) sums[i] += c[i];
                }
            });
            const means = sums.map(s => s / K);
            const expected = w.map(wi => N * wi);
            for (let i = 0; i < N; i++) {
                const diff = Math.abs(means[i] - expected[i]);
                assert.ok(diff < 0.2,
                    `particle ${i}: mean count ${means[i].toFixed(3)} ` +
                    `should be close to ${expected[i].toFixed(3)} (diff=${diff.toFixed(4)})`);
            }
        });
    });
});

describe('runTrials', () => {
    it('returns correct structure', () => {
        const w = uniform();
        const result = withSeed(42, () => runTrials(resample.multinomial, 100, w));
        assert.strictEqual(result.K, 100);
        assert.strictEqual(result.means.length, N);
        assert.strictEqual(result.stds.length, N);
        assert.strictEqual(result.allCounts.length, 100);
    });

    it('mean counts sum to N', () => {
        const w = skewed();
        const result = withSeed(42, () => runTrials(resample.multinomial, 500, w));
        const totalMean = result.means.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(totalMean - N) < 0.01,
            `total mean ${totalMean} should be close to N=${N}`);
    });
});

describe('evalEstimators', () => {
    beforeEach(() => setTestFnKey('position'));

    it('returns estimator values for position test function', () => {
        const w = uniform();
        const hist = withSeed(42, () => runTrials(resample.multinomial, 100, w));
        const ev = evalEstimators(hist, w);
        assert.ok(ev !== null);
        assert.strictEqual(ev.estimators.length, 100);
        assert.ok(typeof ev.estVar === 'number');
        assert.ok(typeof ev.trueVal === 'number');
    });

    it('trueVal equals weighted sum of test function', () => {
        const w = skewed();
        const fVals = getTestFnValues();
        const expected = w.reduce((s, wi, i) => s + wi * fVals[i], 0);
        const hist = withSeed(42, () => runTrials(resample.multinomial, 10, w));
        const ev = evalEstimators(hist, w);
        assert.ok(Math.abs(ev.trueVal - expected) < 1e-12);
    });

    it('returns null for null input', () => {
        assert.strictEqual(evalEstimators(null, uniform()), null);
    });
});
