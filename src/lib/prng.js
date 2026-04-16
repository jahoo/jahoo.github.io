// ================================================================
//  Seedable PRNG — xorshift128
//  Extracted from particle-filter.js for reuse across modules.
// ================================================================

/**
 * Create a seedable xorshift128 PRNG.
 * Returns an object with a `random()` method producing values in [0, 1).
 */
export function createPRNG(seed) {
    seed = seed | 0 || 1;
    const state = [
        seed,
        seed * 2654435761 | 0,
        seed * 0x01000193 | 0,
        seed * 2246822519 | 0,
    ];

    // Warm up
    for (let i = 0; i < 20; i++) next();

    function next() {
        let t = state[3];
        t ^= t << 11;
        t ^= t >>> 8;
        state[3] = state[2];
        state[2] = state[1];
        state[1] = state[0];
        t ^= state[0];
        t ^= state[0] >>> 19;
        state[0] = t;
        return (t >>> 0) / 4294967296; // [0, 1)
    }

    return { random: next };
}

/**
 * Run `fn` with Math.random temporarily replaced by a seeded PRNG,
 * then restore the original Math.random afterwards.
 *
 * This is useful when calling library code that reads Math.random
 * internally (e.g. resampling algorithms) but you need determinism.
 */
export function withSeed(seed, fn) {
    const orig = Math.random;
    const prng = createPRNG(seed);
    Math.random = prng.random;
    try {
        return fn();
    } finally {
        Math.random = orig;
    }
}
