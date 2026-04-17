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

import { parseBib, indexByKey, extractArxivEprints } from '../scripts/build-pubs-bib.js';

test('parseBib: returns CSL-JSON array for sample bib', () => {
  const data = parseBib(SAMPLE_BIB);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 5);
  const ids = data.map(e => e.id);
  assert.deepEqual(ids.sort(), [
    'bar:2023journal', 'baz:2024phd', 'foo:2021conf', 'quux:2022poster', 'qux:2025arxiv',
  ]);
});

test('parseBib: preserves type, title, issued', () => {
  const data = parseBib(SAMPLE_BIB);
  const foo = data.find(e => e.id === 'foo:2021conf');
  assert.ok(foo);
  assert.equal(foo.type, 'paper-conference');
  assert.equal(foo.title, 'A Paper About Things');
  assert.ok(foo.issued);
  assert.equal(foo.issued['date-parts'][0][0], 2021);
});

test('indexByKey: maps id → entry', () => {
  const data = parseBib(SAMPLE_BIB);
  const index = indexByKey(data);
  assert.ok(index instanceof Map);
  assert.equal(index.size, 5);
  assert.equal(index.get('foo:2021conf').title, 'A Paper About Things');
  assert.equal(index.get('nonexistent'), undefined);
});

// citation-js silently drops biblatex's eprint/eprinttype fields when parsing
// to CSL-JSON. We recover arxiv IDs by scanning the raw bib text ourselves.
test('extractArxivEprints: captures eprint + eprinttype=arxiv', () => {
  const text = '@online{foo:2024,\n  eprint = {2401.12345},\n  eprinttype = {arxiv}\n}';
  const map = extractArxivEprints(text);
  assert.equal(map.get('foo:2024'), '2401.12345');
});

test('extractArxivEprints: captures archiveprefix=arXiv variant', () => {
  const text = '@article{bar:2023,\n  archiveprefix = {arXiv},\n  eprint = {2303.01234}\n}';
  const map = extractArxivEprints(text);
  assert.equal(map.get('bar:2023'), '2303.01234');
});

test('extractArxivEprints: case-insensitive arxiv matching', () => {
  const text = '@online{x,\n  eprint = {1234.5678},\n  eprinttype = {ArXiv}\n}';
  const map = extractArxivEprints(text);
  assert.equal(map.get('x'), '1234.5678');
});

test('extractArxivEprints: ignores non-arxiv eprints', () => {
  const text = '@misc{baz,\n  eprint = {12345},\n  eprinttype = {pubmed}\n}';
  const map = extractArxivEprints(text);
  assert.equal(map.size, 0);
});

test('extractArxivEprints: ignores entries without eprint', () => {
  const text = '@article{qux,\n  title = {T},\n  year = {2023}\n}';
  const map = extractArxivEprints(text);
  assert.equal(map.size, 0);
});

test('extractArxivEprints: on sample fixture, captures qux:2025arxiv', () => {
  const map = extractArxivEprints(SAMPLE_BIB);
  assert.equal(map.get('qux:2025arxiv'), '2501.12345');
});

import { mapCslType } from '../scripts/build-pubs-bib.js';

test('mapCslType: article-journal → article', () => {
  assert.equal(mapCslType('article-journal'), 'article');
});

test('mapCslType: paper-conference → inproceedings', () => {
  assert.equal(mapCslType('paper-conference'), 'inproceedings');
});

test('mapCslType: thesis → thesis', () => {
  assert.equal(mapCslType('thesis'), 'thesis');
});

test('mapCslType: webpage → online (biblatex @online maps here)', () => {
  assert.equal(mapCslType('webpage'), 'online');
});

test('mapCslType: post/post-weblog/manuscript → online', () => {
  assert.equal(mapCslType('post'), 'online');
  assert.equal(mapCslType('post-weblog'), 'online');
  assert.equal(mapCslType('manuscript'), 'online');
});

test('mapCslType: document → misc (biblatex @misc maps here)', () => {
  assert.equal(mapCslType('document'), 'misc');
});

test('mapCslType: anything else → misc', () => {
  assert.equal(mapCslType('book'), 'misc');
  assert.equal(mapCslType('chapter'), 'misc');
  assert.equal(mapCslType('report'), 'misc');
  assert.equal(mapCslType('article-magazine'), 'misc');
  assert.equal(mapCslType('unknown'), 'misc');
  assert.equal(mapCslType(undefined), 'misc');
});
