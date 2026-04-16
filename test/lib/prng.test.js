import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPRNG, withSeed } from '../../src/lib/prng.js';

describe('createPRNG', () => {
    it('produces deterministic sequences from the same seed', () => {
        const a = createPRNG(42);
        const b = createPRNG(42);
        const seqA = Array.from({ length: 20 }, () => a.random());
        const seqB = Array.from({ length: 20 }, () => b.random());
        assert.deepStrictEqual(seqA, seqB);
    });

    it('produces values in [0, 1)', () => {
        const prng = createPRNG(123);
        for (let i = 0; i < 10000; i++) {
            const v = prng.random();
            assert.ok(v >= 0, `value ${v} should be >= 0`);
            assert.ok(v < 1, `value ${v} should be < 1`);
        }
    });

    it('different seeds produce different sequences', () => {
        const a = createPRNG(1);
        const b = createPRNG(2);
        const seqA = Array.from({ length: 10 }, () => a.random());
        const seqB = Array.from({ length: 10 }, () => b.random());
        // At least one value should differ
        const allSame = seqA.every((v, i) => v === seqB[i]);
        assert.ok(!allSame, 'sequences from different seeds should differ');
    });

    it('has reasonable distribution (mean near 0.5)', () => {
        const prng = createPRNG(999);
        const N = 50000;
        let sum = 0;
        for (let i = 0; i < N; i++) sum += prng.random();
        const mean = sum / N;
        assert.ok(Math.abs(mean - 0.5) < 0.01,
            `mean ${mean} should be close to 0.5`);
    });
});

describe('withSeed', () => {
    it('restores Math.random after use', () => {
        const orig = Math.random;
        withSeed(42, () => {
            // Math.random should be replaced inside
            assert.notStrictEqual(Math.random, orig);
        });
        assert.strictEqual(Math.random, orig);
    });

    it('restores Math.random even if fn throws', () => {
        const orig = Math.random;
        assert.throws(() => {
            withSeed(42, () => { throw new Error('boom'); });
        }, /boom/);
        assert.strictEqual(Math.random, orig);
    });

    it('produces deterministic results inside fn', () => {
        const a = withSeed(42, () => {
            return Array.from({ length: 10 }, () => Math.random());
        });
        const b = withSeed(42, () => {
            return Array.from({ length: 10 }, () => Math.random());
        });
        assert.deepStrictEqual(a, b);
    });

    it('returns the value from fn', () => {
        const result = withSeed(42, () => 'hello');
        assert.strictEqual(result, 'hello');
    });
});
