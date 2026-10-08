// ================================================================
//  Probability figures — test-util.js
//  Helpers shared by the test files only (not a .test.js, so node
//  --test does not run it, and nothing in a bundle imports it).
// ================================================================

import assert from 'node:assert/strict';
import { createModel } from './model.js';

// The view of a preset in a case, on a fresh model.
export const view = (kase, key) => { const m = createModel(); m.setCase(kase); m.setPreset(key); return m.view(); };

// |a − b| < tol, with both numbers in the message.
export const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) < tol, `${msg} ${a} vs ${b} (tol ${tol})`);
