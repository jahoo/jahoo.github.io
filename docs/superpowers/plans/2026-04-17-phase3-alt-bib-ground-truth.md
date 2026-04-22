# Phase 3 Alt: Bib-Ground-Truth Publications Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parallel publications-page variant at `/pubs-bib/` that uses `~/all-biblatex.bib` (via a gitignored `source.bib` symlink) as the bibliographic source of truth, with a short `pubs-bib.yaml` supplying only website-specific extras (short venue labels, custom links, awards, status).

**Architecture:** Node ES module reads `source.bib` via `@citation-js/core` + `@citation-js/plugin-bibtex`, producing CSL-JSON per entry. An adapter merges CSL-JSON fields with per-key extras from `pubs-bib.yaml`, yielding the same entry shape the existing `generateHtmlEntry` consumes. Reuses `sortEntries`, `validateEntry`, `generateHtmlEntry`, `generateMarkdown` from `scripts/build-pubs.js`; adds a small `bibHref` parameter to `generateMarkdown` so the same function serves both variants. The local BibTeX download (`assets/bibliography/pubs-bib.bib`) is a filter of the global bib, serialized by citation-js.

**Tech Stack:** Node (ES modules), `@citation-js/core` + `@citation-js/plugin-bibtex`, Pandoc (unchanged downstream).

**Reference spec:** `docs/superpowers/specs/2026-04-17-phase3-alt-bib-ground-truth.md`

---

## File Structure

### Created

- `source.bib` — gitignored symlink to the user's local bib file. Created manually at setup time.
- `pubs-bib.yaml` — config: list of `{key, …extras}`. Ground truth for which entries + extras.
- `scripts/build-pubs-bib.js` — new build script (ES module).
- `test/build-pubs-bib.test.js` — unit tests.
- `test/fixtures/sample.bib` — biblatex fixture used by tests (no dependency on user's real bib).

### Modified

- `package.json` — add `@citation-js/core`, `@citation-js/plugin-bibtex` to devDependencies.
- `site.yaml` — add `bib-source: source.bib`.
- `.gitignore` — add `source.bib`.
- `Makefile` — new `pubs-bib` target; add it as prereq of `generate`.
- `scripts/serve.sh` — watch `pubs-bib.yaml`, `scripts/build-pubs-bib.js`, `source.bib`.
- `scripts/build-pubs.js` — add an `options` parameter to `generateMarkdown` so the bib link path can be overridden (default unchanged). No other changes.
- `docs/authoring.md` — "Bib-ground-truth variant (exploration)" section.

### Untouched

- `scripts/build-content.sh` — globs `_generated/*.md`, picks up `_generated/pubs-bib.md` automatically.
- Every other script, template, filter.

### Coexistence

During the exploration, both variants live side-by-side:
- `/pubs/` from `pubs.yaml` → `scripts/build-pubs.js`
- `/pubs-bib/` from `pubs-bib.yaml` → `scripts/build-pubs-bib.js`

After choosing, delete the losing variant's files; rename the survivor if desired.

---

## Pre-task setup

Before Task 1, the controller (or user) creates the symlink:

```bash
ln -s ~/all-biblatex.bib source.bib
```

The build script fails cleanly if this is missing. Tests don't depend on it — they use `test/fixtures/sample.bib`.

---

## Task 1: Install dependencies + scaffold files

**Files:**
- Modify: `package.json`
- Create: `scripts/build-pubs-bib.js`
- Create: `test/build-pubs-bib.test.js`
- Create: `test/fixtures/sample.bib`

- [ ] **Step 1: Install citation-js packages**

Run:
```bash
npm install --save-dev @citation-js/core @citation-js/plugin-bibtex
```

Expected: `devDependencies` gains two entries; `package-lock.json` updated.

- [ ] **Step 2: Create fixture bib**

Create `test/fixtures/sample.bib` with content:
```bibtex
@inproceedings{foo:2021conf,
  author = {First Last and Another Person},
  title = {A Paper About Things},
  booktitle = {Proceedings of the First Conference on Things},
  eventtitle = {FCoT},
  year = {2021},
  month = {11},
  pages = {1--10},
  publisher = {Some Publisher},
  location = {Somewhere},
  doi = {10.1000/abc},
  url = {https://example.com/abc}
}

@article{bar:2023journal,
  author = {Solo Author},
  title = {Another Thing},
  journal = {Journal of Stuff},
  year = {2023},
  month = {7},
  volume = {5},
  pages = {50--75},
  doi = {10.1000/def}
}

@thesis{baz:2024phd,
  author = {The Graduate},
  title = {My Dissertation},
  type = {phdthesis},
  school = {Some University},
  year = {2024},
  url = {https://example.com/thesis}
}

@online{qux:2025arxiv,
  author = {Preprint Writer},
  title = {A Preprint},
  year = {2025},
  eprint = {2501.12345},
  eprinttype = {arxiv}
}

@misc{quux:2022poster,
  author = {Poster Person and Someone Else},
  title = {A Poster},
  howpublished = {Poster at Some Meeting},
  year = {2022}
}
```

- [ ] **Step 3: Scaffold `scripts/build-pubs-bib.js`**

Create file with:
```js
#!/usr/bin/env node
// scripts/build-pubs-bib.js
// Reads source.bib (ground-truth biblatex file) + pubs-bib.yaml (website extras)
// and emits:
//   - _generated/pubs-bib.md (Pandoc markdown for /pubs-bib/)
//   - assets/bibliography/pubs-bib.bib (filter of source.bib, for download)
//
// Bibliographic fields come from source.bib via citation-js; pubs-bib.yaml
// overlays short venue labels, custom links, awards, status, equal-contrib marks.

import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';

import {
  sortEntries,
  validateEntry,
  generateHtmlEntry,
  generateMarkdown,
} from './build-pubs.js';

// ------------------------------------------------------------
// Pure helpers (exported for testing)
// ------------------------------------------------------------

// stubs — filled in by later tasks

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

function main() {
  console.log('build-pubs-bib: not yet implemented');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Scaffold `test/build-pubs-bib.test.js`**

Create file with:
```js
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
```

- [ ] **Step 5: Verify tests pass**

Run: `npm test`
Expected: all tests pass (93 existing + 1 new).

- [ ] **Step 6: Smoke-run citation-js against the fixture**

Quick shell sanity check (one-liner, outside the test file):
```bash
node --input-type=module -e "
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { readFileSync } from 'node:fs';
const bib = readFileSync('test/fixtures/sample.bib', 'utf8');
const data = new Cite(bib).data;
console.log(JSON.stringify(data, null, 2));
"
```

Expected: 5 CSL-JSON objects printed. Read the shape — note especially:
- `type` values (expected: `paper-conference`, `article-journal`, `thesis`, `webpage` or `article`, `article` or `misc`)
- `author` array shape (`{family, given}` per entry)
- `issued.date-parts` for year+month
- `container-title` vs. `event-title`
- where `eprint` lands for the arxiv entry (may be in a `number`, `note`, or custom field)

If citation-js puts arxiv eprint in an unexpected place, note the actual path here and adjust `adaptEntry`'s arxiv logic in Task 8 accordingly.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/build-pubs-bib.js test/build-pubs-bib.test.js test/fixtures/sample.bib
git commit -m "Phase 3 alt: scaffold build-pubs-bib.js + install citation-js"
```

---

## Task 2: `site.yaml` bib-source + `.gitignore`

**Files:**
- Modify: `site.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Add `bib-source` to `site.yaml`**

Edit `/Users/v/Websites/jahoo.github.io/site.yaml`. Append at the end (before any trailing `nav:` if present, or just append — YAML field order doesn't matter):

```yaml
bib-source: source.bib
```

The full file should then look like (confirm by reading first):
```yaml
site-title: jacob hoover vigly
url: https://jahoo.github.io
author: Jacob Hoover Vigly
description: >
  Scientific Program Coordinator at CHI FRO, LLC.
  Formerly Postdoc at MIT, Department of Brain and Cognitive Sciences.
  PhD in Linguistics from McGill University.
bibliography: assets/bibliography/default.bib
bib-source: source.bib
nav:
  - text: home
    url: /
  - text: publications
    url: /pubs/
  - text: posts
    url: /posts/
```

- [ ] **Step 2: Add `source.bib` to `.gitignore`**

Append to `.gitignore`:
```
source.bib
```

- [ ] **Step 3: Commit**

```bash
git add site.yaml .gitignore
git commit -m "Phase 3 alt: site.yaml bib-source + gitignore source.bib"
```

---

## Task 3: Parameterize `generateMarkdown` with `bibHref` option

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

This small change lets both variants use the same function; the bib variant will pass `bibHref: '/assets/bibliography/pubs-bib.bib'`.

- [ ] **Step 1: Add a failing test for the option**

Append to `test/build-pubs.test.js`:
```js
test('generateMarkdown: respects bibHref option', () => {
  const md = generateMarkdown(docEntries, { bibHref: '/assets/bibliography/alt.bib' });
  assert.match(md, /href="\/assets\/bibliography\/alt\.bib"/);
  assert.doesNotMatch(md, /href="\/assets\/bibliography\/pubs\.bib"/);
});

test('generateMarkdown: default bibHref unchanged', () => {
  const md = generateMarkdown(docEntries);
  assert.match(md, /href="\/assets\/bibliography\/pubs\.bib"/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: the first new test fails (href still points at `/assets/bibliography/pubs.bib`).

- [ ] **Step 3: Implement the option**

In `/Users/v/Websites/jahoo.github.io/scripts/build-pubs.js`, find:
```js
export function generateMarkdown(entries) {
  const hasEqual = entries.some(
    (e) => e.equal_contribution && e.equal_contribution.length > 0
  );
  const items = entries.map((e) => generateHtmlEntry(e)).join('\n');

  const parts = [
    '---',
    'title: research',
    'page-style: site',
    '---',
    '',
    '<ul class="social-media-list">',
    `  <li><a href="${GOOGLE_SCHOLAR_URL}">Google Scholar</a></li>`,
    '  <li><a href="/assets/bibliography/pubs.bib">BibTeX</a></li>',
    '</ul>',
```

Replace with:
```js
export function generateMarkdown(entries, options = {}) {
  const bibHref = options.bibHref ?? '/assets/bibliography/pubs.bib';
  const hasEqual = entries.some(
    (e) => e.equal_contribution && e.equal_contribution.length > 0
  );
  const items = entries.map((e) => generateHtmlEntry(e)).join('\n');

  const parts = [
    '---',
    'title: research',
    'page-style: site',
    '---',
    '',
    '<ul class="social-media-list">',
    `  <li><a href="${GOOGLE_SCHOLAR_URL}">Google Scholar</a></li>`,
    `  <li><a href="${bibHref}">BibTeX</a></li>`,
    '</ul>',
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass (95 total).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3 alt: parameterize generateMarkdown with bibHref option"
```

---

## Task 4: `loadBibSource` helper

**Files:**
- Modify: `scripts/build-pubs-bib.js`
- Modify: `test/build-pubs-bib.test.js`

Resolve the bib path from `site.yaml` (with `~` expansion), verify the file exists, read it. Fail cleanly if the symlink is missing or broken.

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs-bib.test.js`:
```js
import { expandHome, loadBibSource } from '../scripts/build-pubs-bib.js';
import { writeFileSync, mkdirSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
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
  const dir = `${tmpdir()}/pubs-bib-test-${Date.now()}`;
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
    /not found.*ln -s/s
  );
});

test('loadBibSource: broken symlink throws with actionable message', () => {
  const dir = `${tmpdir()}/pubs-bib-test-${Date.now()}`;
  mkdirSync(dir, { recursive: true });
  const linkPath = `${dir}/broken.bib`;
  symlinkSync(`${dir}/nonexistent-target.bib`, linkPath);
  assert.throws(
    () => loadBibSource(linkPath),
    /not found.*ln -s/s
  );
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL with missing export.

- [ ] **Step 3: Implement in `scripts/build-pubs-bib.js`**

Replace the "stubs — filled in by later tasks" line with:
```js
export function expandHome(path) {
  if (path.startsWith('~/') || path === '~') {
    return homedir() + path.slice(1);
  }
  return path;
}

export function loadBibSource(path) {
  const resolved = expandHome(path);
  // existsSync follows symlinks, so broken symlinks return false.
  if (!existsSync(resolved)) {
    throw new Error(
      `source.bib not found at ${resolved}\n` +
      `Create a symlink to your bib file, e.g.:\n` +
      `  ln -s ~/all-biblatex.bib source.bib`
    );
  }
  return readFileSync(resolved, 'utf8');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js test/build-pubs-bib.test.js
git commit -m "Phase 3 alt: loadBibSource (resolve path, fail cleanly on missing symlink)"
```

---

## Task 5: `parseBib` + `indexByKey` helpers

**Files:**
- Modify: `scripts/build-pubs-bib.js`
- Modify: `test/build-pubs-bib.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs-bib.test.js`:
```js
import { parseBib, indexByKey } from '../scripts/build-pubs-bib.js';

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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs-bib.js` (after `loadBibSource`):
```js
export function parseBib(text) {
  return new Cite(text).data;
}

export function indexByKey(entries) {
  return new Map(entries.map((e) => [e.id, e]));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

**Note:** If `parseBib`'s assertions fail (type names don't match, etc.), citation-js's mappings may differ from the expectations above. Adjust the tests to match actual output; don't mangle the implementation to produce expected-but-wrong values. Citation-js is the ground truth here.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js test/build-pubs-bib.test.js
git commit -m "Phase 3 alt: parseBib + indexByKey via citation-js"
```

---

## Task 6: `mapCslType` helper

**Files:**
- Modify: `scripts/build-pubs-bib.js`
- Modify: `test/build-pubs-bib.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs-bib.test.js`:
```js
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

test('mapCslType: webpage/post → online', () => {
  assert.equal(mapCslType('webpage'), 'online');
  assert.equal(mapCslType('post'), 'online');
  assert.equal(mapCslType('post-weblog'), 'online');
});

test('mapCslType: manuscript → online', () => {
  assert.equal(mapCslType('manuscript'), 'online');
});

test('mapCslType: anything else → misc', () => {
  assert.equal(mapCslType('book'), 'misc');
  assert.equal(mapCslType('chapter'), 'misc');
  assert.equal(mapCslType('report'), 'misc');
  assert.equal(mapCslType('article-magazine'), 'misc');
  assert.equal(mapCslType('unknown'), 'misc');
  assert.equal(mapCslType(undefined), 'misc');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs-bib.js`:
```js
const CSL_TYPE_MAP = {
  'article-journal': 'article',
  'paper-conference': 'inproceedings',
  'thesis': 'thesis',
  'webpage': 'online',
  'post': 'online',
  'post-weblog': 'online',
  'manuscript': 'online',
};

export function mapCslType(cslType) {
  return CSL_TYPE_MAP[cslType] ?? 'misc';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js test/build-pubs-bib.test.js
git commit -m "Phase 3 alt: mapCslType (CSL-JSON type → entry type)"
```

---

## Task 7: `cslAuthorsToStrings` helper

**Files:**
- Modify: `scripts/build-pubs-bib.js`
- Modify: `test/build-pubs-bib.test.js`

Convert CSL-JSON's author array (each entry `{family, given, "non-dropping-particle"?, suffix?}`) into the `"First Last"` string format `formatAuthorsHtml` expects.

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs-bib.test.js`:
```js
import { cslAuthorsToStrings } from '../scripts/build-pubs-bib.js';

test('cslAuthorsToStrings: simple given + family', () => {
  assert.deepEqual(
    cslAuthorsToStrings([{ given: 'First', family: 'Last' }]),
    ['First Last']
  );
});

test('cslAuthorsToStrings: multiple authors', () => {
  assert.deepEqual(
    cslAuthorsToStrings([
      { given: 'Alice', family: 'Smith' },
      { given: 'Bob', family: 'Jones' },
    ]),
    ['Alice Smith', 'Bob Jones']
  );
});

test('cslAuthorsToStrings: non-dropping particle kept with family', () => {
  assert.deepEqual(
    cslAuthorsToStrings([
      { given: 'Ludwig', 'non-dropping-particle': 'van', family: 'Beethoven' },
    ]),
    ['Ludwig van Beethoven']
  );
});

test('cslAuthorsToStrings: dropping particle placed after given', () => {
  assert.deepEqual(
    cslAuthorsToStrings([
      { given: 'Charles', 'dropping-particle': 'de', family: 'Gaulle' },
    ]),
    ['Charles de Gaulle']
  );
});

test('cslAuthorsToStrings: suffix appended', () => {
  assert.deepEqual(
    cslAuthorsToStrings([
      { given: 'John', family: 'Smith', suffix: 'Jr.' },
    ]),
    ['John Smith Jr.']
  );
});

test('cslAuthorsToStrings: literal name (single string)', () => {
  assert.deepEqual(
    cslAuthorsToStrings([{ literal: 'An Organization' }]),
    ['An Organization']
  );
});

test('cslAuthorsToStrings: only family (single-name authors)', () => {
  assert.deepEqual(
    cslAuthorsToStrings([{ family: 'Plato' }]),
    ['Plato']
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs-bib.js`:
```js
export function cslAuthorsToStrings(authors) {
  if (!authors) return [];
  return authors.map((a) => {
    if (a.literal) return a.literal;
    const parts = [];
    if (a.given) parts.push(a.given);
    if (a['dropping-particle']) parts.push(a['dropping-particle']);
    if (a['non-dropping-particle']) parts.push(a['non-dropping-particle']);
    if (a.family) parts.push(a.family);
    if (a.suffix) parts.push(a.suffix);
    return parts.join(' ');
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js test/build-pubs-bib.test.js
git commit -m "Phase 3 alt: cslAuthorsToStrings (CSL-JSON authors → First Last)"
```

---

## Task 8: `adaptEntry` — the bib+extras merge

**Files:**
- Modify: `scripts/build-pubs-bib.js`
- Modify: `test/build-pubs-bib.test.js`

This is the heart of the variant. Converts one CSL-JSON entry + its extras overlay into an entry object matching what `generateHtmlEntry` consumes.

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs-bib.test.js`:
```js
import { adaptEntry } from '../scripts/build-pubs-bib.js';

// A hand-crafted CSL-JSON entry (shape approximately what citation-js emits)
const cslInproceedings = {
  id: 'foo:2021conf',
  type: 'paper-conference',
  title: 'A Paper About Things',
  author: [
    { given: 'First', family: 'Last' },
    { given: 'Another', family: 'Person' },
  ],
  'container-title': 'Proceedings of the First Conference on Things',
  'event-title': 'FCoT',
  issued: { 'date-parts': [[2021, 11]] },
  page: '1-10',
  publisher: 'Some Publisher',
  'publisher-place': 'Somewhere',
  DOI: '10.1000/abc',
  URL: 'https://example.com/abc',
};

test('adaptEntry: basic inproceedings, no extras', () => {
  const e = adaptEntry(cslInproceedings, {});
  assert.equal(e.id, 'foo:2021conf');
  assert.equal(e.title, 'A Paper About Things');
  assert.deepEqual(e.authors, ['First Last', 'Another Person']);
  assert.equal(e.year, 2021);
  assert.equal(e.month, 11);
  assert.equal(e.type, 'inproceedings');
  assert.equal(e.venue_full, 'Proceedings of the First Conference on Things');
  // venue falls back to event-title when no extras.venue
  assert.equal(e.venue, 'FCoT');
  assert.equal(e.pages, '1-10');
  assert.equal(e.publisher, 'Some Publisher');
  assert.equal(e.address, 'Somewhere');
  assert.equal(e.doi, '10.1000/abc');
  assert.equal(e.links.url, 'https://example.com/abc');
  assert.equal(e.links.doi_url, 'https://doi.org/10.1000/abc');
});

test('adaptEntry: venue fallback chain', () => {
  // extras.venue wins
  const e1 = adaptEntry(cslInproceedings, { venue: 'Short Label' });
  assert.equal(e1.venue, 'Short Label');
  // without event-title, falls back to container-title
  const { 'event-title': _, ...noEvent } = cslInproceedings;
  const e2 = adaptEntry(noEvent, {});
  assert.equal(e2.venue, 'Proceedings of the First Conference on Things');
});

test('adaptEntry: article → journal as container-title', () => {
  const cslArticle = {
    id: 'bar:2023',
    type: 'article-journal',
    title: 'Another Thing',
    author: [{ given: 'Solo', family: 'Author' }],
    'container-title': 'Journal of Stuff',
    issued: { 'date-parts': [[2023, 7]] },
    DOI: '10.1000/def',
  };
  const e = adaptEntry(cslArticle, {});
  assert.equal(e.type, 'article');
  assert.equal(e.venue_full, 'Journal of Stuff');
  assert.equal(e.venue, 'Journal of Stuff');
  assert.equal(e.links.doi_url, 'https://doi.org/10.1000/def');
});

test('adaptEntry: thesis', () => {
  const cslThesis = {
    id: 'baz:2024phd',
    type: 'thesis',
    title: 'My Dissertation',
    author: [{ given: 'The', family: 'Graduate' }],
    publisher: 'Some University',
    issued: { 'date-parts': [[2024]] },
    URL: 'https://example.com/thesis',
  };
  const e = adaptEntry(cslThesis, {});
  assert.equal(e.type, 'thesis');
  assert.equal(e.venue, 'Some University');
  assert.equal(e.venue_full, 'Some University');
  assert.equal(e.links.url, 'https://example.com/thesis');
});

test('adaptEntry: extras note + status + equal_contribution', () => {
  const e = adaptEntry(cslInproceedings, {
    note: 'Best Paper',
    status: 'preprint',
    equal_contribution: [0, 1],
  });
  assert.equal(e.note, 'Best Paper');
  assert.equal(e.status, 'preprint');
  assert.deepEqual(e.equal_contribution, [0, 1]);
});

test('adaptEntry: links merge — extras add to bib-derived', () => {
  const e = adaptEntry(cslInproceedings, {
    links: {
      code: 'https://github.com/foo',
      slides: 'talk.pdf',
    },
  });
  // bib-derived
  assert.equal(e.links.url, 'https://example.com/abc');
  assert.equal(e.links.doi_url, 'https://doi.org/10.1000/abc');
  // extras
  assert.equal(e.links.code, 'https://github.com/foo');
  assert.equal(e.links.slides, 'talk.pdf');
});

test('adaptEntry: extras.links.url overrides bib URL', () => {
  const e = adaptEntry(cslInproceedings, {
    links: { url: 'https://override.com' },
  });
  assert.equal(e.links.url, 'https://override.com');
});

test('adaptEntry: extras.venue_url only from extras', () => {
  const e = adaptEntry(cslInproceedings, { venue_url: 'https://fcot.org' });
  assert.equal(e.venue_url, 'https://fcot.org');
});

test('adaptEntry: extras.note overrides bib note', () => {
  const withBibNote = { ...cslInproceedings, note: 'bib note' };
  const e1 = adaptEntry(withBibNote, {});
  assert.equal(e1.note, 'bib note');
  const e2 = adaptEntry(withBibNote, { note: 'extras note' });
  assert.equal(e2.note, 'extras note');
});

test('adaptEntry: links.arxiv derived from CSL number field', () => {
  // citation-js places arXiv eprint in `number` when eprinttype=arxiv
  const cslPreprint = {
    id: 'qux:2025arxiv',
    type: 'article',
    title: 'A Preprint',
    author: [{ given: 'Preprint', family: 'Writer' }],
    issued: { 'date-parts': [[2025]] },
    number: '2501.12345',
    genre: 'arxiv',
  };
  const e = adaptEntry(cslPreprint, {});
  assert.equal(e.links.arxiv, '2501.12345');
});

test('adaptEntry: editor from bib', () => {
  const cslWithEditor = {
    ...cslInproceedings,
    editor: [
      { given: 'Ed', family: 'One' },
      { given: 'Ed', family: 'Two' },
    ],
  };
  const e = adaptEntry(cslWithEditor, {});
  assert.equal(e.editor, 'Ed One, Ed Two');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs-bib.js`:
```js
// Extract year/month/day from CSL-JSON's issued field.
function extractDate(issued) {
  if (!issued || !issued['date-parts'] || !issued['date-parts'][0]) {
    return { year: null, month: null, day: null };
  }
  const [year, month, day] = issued['date-parts'][0];
  return {
    year: year ?? null,
    month: month ?? null,
    day: day ?? null,
  };
}

// arXiv preprints exported from Zotero (eprinttype=arxiv + eprint=ID) end up
// with the ID in CSL-JSON's `number` field and a `genre` hint. Some versions
// of citation-js may also set `archive` or put it in `note`. We check the
// common locations in order.
function extractArxivId(csl) {
  const isArxiv =
    (csl.genre && csl.genre.toLowerCase().includes('arxiv')) ||
    (csl.archive && csl.archive.toLowerCase().includes('arxiv'));
  if (isArxiv && csl.number) return String(csl.number);
  // Some exports put "arXiv:XXXX.YYYY" directly in note
  if (csl.note && /arXiv:\s*\S+/i.test(csl.note)) {
    return csl.note.match(/arXiv:\s*(\S+)/i)[1];
  }
  return null;
}

export function adaptEntry(csl, extras = {}) {
  const { year, month, day } = extractDate(csl.issued);
  const type = mapCslType(csl.type);

  const containerTitle =
    csl['container-title'] || csl.journal || csl.booktitle || undefined;
  const eventTitle = csl['event-title'] || csl['event'] || undefined;

  // venue: extras override; else short forms; else container-title
  const venue =
    extras.venue ??
    csl['container-title-short'] ??
    eventTitle ??
    containerTitle ??
    // for theses, CSL often has publisher = school
    (type === 'thesis' ? csl.publisher : undefined);

  // Links: merge bib-derived + extras
  const bibUrl = csl.URL || undefined;
  const doiUrl = csl.DOI ? `https://doi.org/${csl.DOI}` : undefined;
  const arxivId = extractArxivId(csl);

  const links = { ...(extras.links ?? {}) };
  if (!links.url && bibUrl) links.url = bibUrl;
  if (!links.doi_url && doiUrl) links.doi_url = doiUrl;
  if (!links.arxiv && arxivId) links.arxiv = arxivId;

  const entry = {
    id: csl.id,
    title: csl.title,
    authors: cslAuthorsToStrings(csl.author),
    year,
    type,
    venue,
  };
  if (month != null) entry.month = month;
  if (day != null) entry.day = day;
  if (containerTitle) entry.venue_full = containerTitle;
  if (extras.venue_url) entry.venue_url = extras.venue_url;
  if (csl.page) entry.pages = csl.page;
  // For thesis: CSL stores school in publisher. Don't duplicate it as publisher+venue.
  if (csl.publisher && type !== 'thesis') entry.publisher = csl.publisher;
  const address = csl['event-place'] || csl['publisher-place'];
  if (address) entry.address = address;
  if (csl.DOI) entry.doi = csl.DOI;
  if (csl.editor) {
    entry.editor = cslAuthorsToStrings(csl.editor).join(', ');
  }

  // note: extras wins, else bib note
  const note = extras.note ?? csl.note;
  if (note) entry.note = note;

  if (extras.status) entry.status = extras.status;
  if (extras.equal_contribution) entry.equal_contribution = extras.equal_contribution;

  if (Object.keys(links).length > 0) entry.links = links;

  return entry;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

**Note:** if citation-js places `arXiv` eprint ID in a field other than `number`+`genre`, the `extractArxivId` logic may need adjustment. The Task 1 smoke test should have surfaced the actual location — update `extractArxivId` and the `links.arxiv derived` test to match.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js test/build-pubs-bib.test.js
git commit -m "Phase 3 alt: adaptEntry (CSL-JSON + extras → entry shape)"
```

---

## Task 9: `main()` — glue + CLI

**Files:**
- Modify: `scripts/build-pubs-bib.js`

- [ ] **Step 1: Replace the placeholder `main()` with the real implementation**

Replace:
```js
function main() {
  console.log('build-pubs-bib: not yet implemented');
}
```

With:
```js
function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function main() {
  // 1. Read site.yaml, resolve bib-source path.
  const siteMeta = yaml.load(readFileSync('site.yaml', 'utf8'));
  const bibSourcePath = siteMeta['bib-source'];
  if (!bibSourcePath) {
    console.error('site.yaml must define bib-source: source.bib');
    process.exit(1);
  }

  // 2. Load + parse the global bib.
  let bibText;
  try {
    bibText = loadBibSource(bibSourcePath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const cslAll = parseBib(bibText);
  const index = indexByKey(cslAll);

  // 3. Read pubs-bib.yaml.
  if (!existsSync('pubs-bib.yaml')) {
    console.error('pubs-bib.yaml not found at repo root');
    process.exit(1);
  }
  const overlays = yaml.load(readFileSync('pubs-bib.yaml', 'utf8'));
  if (!Array.isArray(overlays)) {
    console.error('pubs-bib.yaml must be a list of {key, ...extras} objects');
    process.exit(1);
  }

  // 4. For each requested key: find in bib, adapt, validate.
  const entries = [];
  const missing = [];
  for (const overlay of overlays) {
    const { key, ...extras } = overlay;
    if (!key) {
      console.error(`pubs-bib.yaml entry missing required 'key': ${JSON.stringify(overlay)}`);
      process.exit(1);
    }
    const csl = index.get(key);
    if (!csl) {
      missing.push(key);
      continue;
    }
    entries.push(adaptEntry(csl, extras));
  }
  if (missing.length > 0) {
    console.error(
      `The following keys were not found in source.bib:\n` +
      missing.map(k => `  - ${k}`).join('\n')
    );
    process.exit(1);
  }

  try {
    entries.forEach(validateEntry);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 5. Sort + render markdown.
  const sorted = sortEntries(entries);
  ensureDir('_generated');
  writeFileSync(
    '_generated/pubs-bib.md',
    generateMarkdown(sorted, { bibHref: '/assets/bibliography/pubs-bib.bib' })
  );
  console.log(`Generated: _generated/pubs-bib.md (${sorted.length} entries)`);

  // 6. Serialize selected CSL-JSON back to biblatex for the download.
  const selectedCsl = sorted.map(e => index.get(e.id));
  let biblatex;
  try {
    biblatex = new Cite(selectedCsl).format('biblatex', { format: 'text' });
  } catch {
    // Fallback to older format name if the current version uses 'bibtex'.
    biblatex = new Cite(selectedCsl).format('bibtex', { format: 'text' });
  }
  ensureDir('assets/bibliography');
  writeFileSync('assets/bibliography/pubs-bib.bib', biblatex);
  console.log(`Generated: assets/bibliography/pubs-bib.bib (${sorted.length} entries)`);
}
```

- [ ] **Step 2: Create a temporary `pubs-bib.yaml` to smoke-test main()**

```bash
cat > pubs-bib.yaml <<'EOF'
- key: foo:2021conf
  venue: FCoT '21
  links:
    code: https://example.com/code

- key: bar:2023journal
EOF
```

And a temporary source.bib symlink pointing at the fixture:
```bash
ln -sf "$(pwd)/test/fixtures/sample.bib" source.bib
```

- [ ] **Step 3: Run `node scripts/build-pubs-bib.js`**

Expected output (approximately):
```
Generated: _generated/pubs-bib.md (2 entries)
Generated: assets/bibliography/pubs-bib.bib (2 entries)
```

Inspect `_generated/pubs-bib.md` and `assets/bibliography/pubs-bib.bib`:
```bash
cat _generated/pubs-bib.md
cat assets/bibliography/pubs-bib.bib
```

Confirm:
- pubs-bib.md has front matter + 2 `<li class="pub">` entries + the name-change note
- BibTeX link in header points at `/assets/bibliography/pubs-bib.bib`
- pubs-bib.bib has 2 entries

- [ ] **Step 4: Clean up the temporary fixtures**

```bash
rm pubs-bib.yaml _generated/pubs-bib.md assets/bibliography/pubs-bib.bib source.bib
```

(The real `pubs-bib.yaml` and `source.bib` go in place in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs-bib.js
git commit -m "Phase 3 alt: main() reads site.yaml + pubs-bib.yaml, emits pubs-bib.md + pubs-bib.bib"
```

---

## Task 10: Create real `pubs-bib.yaml` + `source.bib` symlink

**Files:**
- Create: `source.bib` (gitignored symlink)
- Create: `pubs-bib.yaml`

- [ ] **Step 1: Create the symlink to the user's real bib**

```bash
ln -s ~/all-biblatex.bib source.bib
```

Verify:
```bash
ls -la source.bib
# should show: source.bib -> /Users/.../all-biblatex.bib
```

And confirm it's not staged (gitignored from Task 2):
```bash
git status --short
# should NOT list source.bib
```

- [ ] **Step 2: Create `pubs-bib.yaml` with the 14 keys**

Content:
```yaml
# Publications listed on /pubs-bib/.
# Bibliographic data comes from source.bib; this file holds only
# website-specific extras. Schema: see docs/superpowers/specs/2026-04-17-phase3-alt-bib-ground-truth.md

- key: chan.r:2026arxiv
  status: preprint

- key: vigly.j:2025cogsci
  venue: CogSci 2025

- key: clark.t:2025cogsci
  venue: CogSci 2025

- key: vigly.j:2025psyarxiv
  venue: PsyArXiv
  status: preprint

- key: lipkin.b:2025
  venue: CoLM 2025
  venue_url: https://colmweb.org/
  note: "Outstanding Paper Award"
  links:
    code: https://github.com/probcomp/genparse
    openreview: https://openreview.net/forum?id=3BmPSFAdq3

- key: vigly.j:2025HSP
  venue: HSP 2025

- key: clark.t:2025HSP
  venue: HSP 2025

- key: hoover.j:2024phd
  venue: McGill University
  links:
    pdf: dissertation.pdf
    other:
      - label: précis
        url: /assets/pdfs/dissertation_precis.pdf

- key: rahimi.h:2024

- key: hoover.j:2023
  venue: Open Mind
  links:
    code: https://github.com/mcqll/plausibility-sampling-processing/
    other:
      - label: surprisal explorer
        url: https://jahoo.shinyapps.io/surprisal_explorer/

- key: socolof.m:2022
  venue: COLING 2022

- key: hoover.j:2022poster

- key: hoover.j:2021EMNLP
  venue: EMNLP 2021
  links:
    code: https://github.com/mcqll/cpmi-dependencies
    slides: 2021.10.11.EMNLP.talk-slides.pdf
    poster: 2021.10.11.EMNLP.poster.pdf

- key: hoover.j:2021WCCFL
  venue: WCCFL 38
  links:
    pdf: wccfl2020-cascadilla-paper3568-proof.pdf
    handout: wccfl2020-handout.pdf
```

The exact `extras` (venue labels, links, notes) are best-effort from the current `pubs.yaml`; adjust during verification if anything looks off against the generated page. Missing `venue` entries fall back to whatever citation-js surfaces from the bib.

- [ ] **Step 3: Run build to verify the real data works end-to-end**

```bash
node scripts/build-pubs-bib.js
```

Expected: `Generated: _generated/pubs-bib.md (14 entries)` and `Generated: assets/bibliography/pubs-bib.bib (14 entries)`. If any keys are missing from the bib, the script will list them — fix the key spellings in pubs-bib.yaml and re-run.

- [ ] **Step 4: Inspect outputs**

```bash
head -30 _generated/pubs-bib.md
head -30 assets/bibliography/pubs-bib.bib
```

Confirm visually: the list is reverse-chronological, each entry has title/authors/venue, status tag on preprints, note on Lipkin entry, link buttons present.

- [ ] **Step 5: Commit**

```bash
git add pubs-bib.yaml _generated/pubs-bib.md assets/bibliography/pubs-bib.bib
git commit -m "Phase 3 alt: pubs-bib.yaml + initial generated outputs"
```

---

## Task 11: Makefile + serve.sh integration

**Files:**
- Modify: `Makefile`
- Modify: `scripts/serve.sh`

- [ ] **Step 1: Add `pubs-bib` target to `Makefile`**

Find:
```makefile
.PHONY: all clean content js assets static-html serve test generate pubs

all: generate content js assets static-html

# ---- Generate listing + publications ----
generate: pubs
	@pandoc lua scripts/build-index.lua

pubs:
	@node scripts/build-pubs.js
```

Replace with:
```makefile
.PHONY: all clean content js assets static-html serve test generate pubs pubs-bib

all: generate content js assets static-html

# ---- Generate listing + publications ----
generate: pubs pubs-bib
	@pandoc lua scripts/build-index.lua

pubs:
	@node scripts/build-pubs.js

pubs-bib:
	@node scripts/build-pubs-bib.js
```

- [ ] **Step 2: Run `make` to verify clean build**

```bash
make
```

Expected (among other output): `Generated: _generated/pubs-bib.md (14 entries)` and `Build: _generated/pubs-bib.md` from pandoc.

Check the rendered page:
```bash
ls _site/pubs-bib/ && head -60 _site/pubs-bib/index.html | grep -E "pub-title|pub-venue" | head -5
```

- [ ] **Step 3: Add watcher handler to `scripts/serve.sh`**

Find:
```bash
"$FSWATCH" -r --event Updated \
    content/ filters/ templates/ assets/css/ assets/fonts/ site.yaml pubs.yaml scripts/ \
    2>/dev/null \
| while IFS= read -r changed; do
    case "$changed" in
        *pubs.yaml|*build-pubs.js)
            echo "Pubs changed — regenerating pubs.md + pubs.bib"
            node scripts/build-pubs.js || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
```

Replace with:
```bash
"$FSWATCH" -r --event Updated \
    content/ filters/ templates/ assets/css/ assets/fonts/ site.yaml pubs.yaml pubs-bib.yaml source.bib scripts/ \
    2>/dev/null \
| while IFS= read -r changed; do
    case "$changed" in
        *pubs-bib.yaml|*build-pubs-bib.js|*source.bib|*all-biblatex.bib)
            echo "Pubs-bib changed — regenerating pubs-bib.md + pubs-bib.bib"
            node scripts/build-pubs-bib.js || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
        *pubs.yaml|*build-pubs.js)
            echo "Pubs changed — regenerating pubs.md + pubs.bib"
            node scripts/build-pubs.js || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
```

**Note:** `fswatch` on a symlink (`source.bib`) follows by default; on some macOS configurations it may resolve to the target path (`~/all-biblatex.bib`). The `*all-biblatex.bib` branch handles that case.

- [ ] **Step 4: Smoke-test the watcher**

Start `make serve` in the background (or another terminal). Touch `pubs-bib.yaml`:
```bash
touch pubs-bib.yaml
```
Expected log lines include "Pubs-bib changed — regenerating pubs-bib.md + pubs-bib.bib".

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add Makefile scripts/serve.sh
git commit -m "Phase 3 alt: Makefile + serve.sh integrate pubs-bib build"
```

---

## Task 12: Authoring guide update

**Files:**
- Modify: `docs/authoring.md`

- [ ] **Step 1: Add a new section after "Adding a publication"**

Find the end of the "Adding a publication" section (just before `## Build commands`). Insert this block:

````markdown
### Bib-ground-truth variant (exploration)

A parallel experiment at `/pubs-bib/` uses a BibLaTeX file as the bibliographic source of truth instead of duplicating bib data in `pubs.yaml`. It's live alongside the YAML variant during a comparison phase; one will be chosen and the other removed.

**Setup.** Create a gitignored symlink at the repo root pointing at your local bib file (which must be in BibLaTeX format — Zotero's "Better BibLaTeX" export works; classic BibTeX largely works modulo a few field-name differences):

```bash
ln -s ~/all-biblatex.bib source.bib
```

The path on the right-hand side is wherever your bib actually lives; `source.bib` is what the build reads. If the symlink is missing or broken, `node scripts/build-pubs-bib.js` exits with a clear error pointing at this command.

**Config file (`pubs-bib.yaml`).** Lists entries by bib key, with only website-specific extras:

```yaml
- key: surname.f:2024key           # required; must exist in source.bib
  venue: SHORT 2024                # optional: short display label
  venue_url: https://…             # optional: link for the venue label
  note: "Outstanding Paper Award"  # optional: shown in parens
  status: preprint                 # optional: small tag (preprint | forthcoming | …)
  equal_contribution: [0, 1]       # optional: 0-based author indices
  links:
    code: https://…                # link buttons — other types:
    slides: talk.pdf               #   preprint, openreview, video, lingbuzz,
    poster: poster.pdf             #   handout, pdf, other: [{label, url}]
```

Bibliographic fields (title, authors, year, venue_full, DOI, URL) are pulled from the bib. The `venue` overlay is a short display label; without it, the page falls back to the `shortjournal`/`shortseries`/`eventtitle`/`container-title` from the bib, in that order.

**Differences from the YAML variant.** `/pubs/` (from `pubs.yaml`) duplicates bib data in YAML; `/pubs-bib/` (from `pubs-bib.yaml` + source.bib) keeps bib data canonical in the bib and overlays only extras. Same renderer, different data source. See `docs/superpowers/specs/2026-04-17-phase3-alt-bib-ground-truth.md`.
````

- [ ] **Step 2: Update the build-commands list**

Find:
```bash
make pubs       # regenerate pubs.md + pubs.bib from pubs.yaml
```

Replace with:
```bash
make pubs       # regenerate pubs.md + pubs.bib from pubs.yaml
make pubs-bib   # regenerate pubs-bib.md + pubs-bib.bib from pubs-bib.yaml + source.bib
```

- [ ] **Step 3: Commit**

```bash
git add docs/authoring.md
git commit -m "Phase 3 alt: authoring guide covers pubs-bib.yaml + source.bib workflow"
```

---

## Task 13: Final verification

- [ ] **Step 1: Clean build from scratch**

```bash
trash _site
make
```

(Run `trash` with `dangerouslyDisableSandbox: true`.)

Expected: no errors; both `_generated/pubs.md` and `_generated/pubs-bib.md` listed as built.

- [ ] **Step 2: Run tests**

```bash
make test
```

Expected: all tests pass. Target count depends on exactly how many new tests landed (~25 new for this plan).

- [ ] **Step 3: Browse both pages**

Start `make serve`, visit:
- `http://localhost:4000/pubs/` — YAML variant (from Phase 3)
- `http://localhost:4000/pubs-bib/` — bib variant (this plan)

Compare:
- Same visual layout (same renderer)
- Same entries (may differ since bib variant has 14 keys + 5 not previously in pubs.yaml)
- Both have Google Scholar link + BibTeX download link
- Bib variant's BibTeX link downloads `pubs-bib.bib`; YAML variant's downloads `pubs.bib`
- Download each BibTeX; spot-check they parse cleanly

- [ ] **Step 4: No new commits unless fixes are needed**

If anything's wrong, fix and commit as a follow-up.

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Bib source location (symlink + site.yaml + .gitignore) | 2, 10 |
| Config file (`pubs-bib.yaml`) | 10, 12 |
| Merge rules (bib + extras) | 8 (via `adaptEntry`) |
| Build script (`scripts/build-pubs-bib.js`) | 1 (scaffold) + 4–9 |
| `loadBibSource` | 4 |
| `parseBib` + `indexByKey` | 5 |
| `mapCslType` | 6 |
| `cslAuthorsToStrings` | 7 |
| `adaptEntry` | 8 |
| `main()` CLI | 9 |
| Dependencies (citation-js) | 1 |
| Makefile integration | 11 |
| `serve.sh` watcher | 11 |
| Testing (unit + fixture bib) | 1 (fixture), 4–8 (unit tests) |
| Reuse from `build-pubs.js` (including `generateMarkdown` with `bibHref`) | 3 |
| BibTeX download (`pubs-bib.bib`) via citation-js serialize | 9 |
| Styling (reused CSS) | — (no new CSS) |
| `.gitignore` change | 2 |
| Authoring guide update | 12 |

No gaps.
