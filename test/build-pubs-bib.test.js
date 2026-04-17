// test/build-pubs-bib.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SAMPLE_BIB = readFileSync(
  resolve(__dirname, 'fixtures/sample.bib'),
  'utf8'
);

test('scaffold loads', () => {
  assert.ok(SAMPLE_BIB.length > 0);
});
