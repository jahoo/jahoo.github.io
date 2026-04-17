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

import { expandHome, loadBibSource } from '../scripts/build-pubs-bib.js';
import { writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('expandHome: leading ~ expands to homedir', () => {
  const result = expandHome('~/foo/bar');
  assert.notEqual(result, '~/foo/bar');
  assert.match(result, /\/foo\/bar$/);
});

test('expandHome: no ~ returns unchanged', () => {
  assert.equal(expandHome('/abs/path'), '/abs/path');
  assert.equal(expandHome('rel/path'), 'rel/path');
});

test('loadBibSource: reads file contents from resolved path', () => {
  const dir = `${tmpdir()}/pubs-bib-test-${Date.now()}-load`;
  mkdirSync(dir, { recursive: true });
  const bibPath = `${dir}/test.bib`;
  writeFileSync(bibPath, '@article{x, title={T}, author={A B}, year={2025}}');
  const text = loadBibSource(bibPath);
  assert.match(text, /@article\{x/);
  rmSync(dir, { recursive: true, force: true });
});

test('loadBibSource: missing file throws with actionable message', () => {
  const missing = `${tmpdir()}/definitely-does-not-exist-${Date.now()}.bib`;
  assert.throws(
    () => loadBibSource(missing),
    /not found[\s\S]*ln -s/
  );
});

test('loadBibSource: broken symlink throws with actionable message', () => {
  const dir = `${tmpdir()}/pubs-bib-test-${Date.now()}-broken`;
  mkdirSync(dir, { recursive: true });
  const linkPath = `${dir}/broken.bib`;
  symlinkSync(`${dir}/nonexistent-target.bib`, linkPath);
  assert.throws(
    () => loadBibSource(linkPath),
    /not found[\s\S]*ln -s/
  );
  rmSync(dir, { recursive: true, force: true });
});
