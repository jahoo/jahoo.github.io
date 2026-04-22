# Phase 3 Publications Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jekyll-scholar with a Node-based build that reads `pubs.yaml` and generates both the publications page HTML and a downloadable BibTeX file.

**Architecture:** `pubs.yaml` at repo root is the source of truth. `scripts/build-pubs.js` reads it, validates, sorts, and emits (a) `_generated/pubs.md` — Pandoc markdown with an HTML list inside a `` ```{=html} `` block, compiled by the existing content pipeline; and (b) `assets/bibliography/pubs.bib` — a generated BibTeX file linked from the page. Pure formatting functions are exported and unit-tested; a thin `main()` wires them together with file I/O.

**Tech Stack:** Node (ES modules) + `js-yaml`. Pandoc templates/filters unchanged. Tests via `node --test`.

**Reference spec:** `docs/superpowers/specs/2026-04-17-phase3-publications-page.md`

---

## File Structure

### Created

- `pubs.yaml` — source of truth, repo root
- `scripts/build-pubs.js` — build script, exports pure functions, runs `main()` when invoked
- `test/build-pubs.test.js` — unit tests for pure functions

### Modified

- `package.json` — add `js-yaml` to `devDependencies`
- `Makefile` — add `pubs` target, update `generate` to invoke it
- `scripts/serve.sh` — watch `pubs.yaml` and `scripts/build-pubs.js`, rebuild on change
- `assets/css/site.css` — add styles for `.pub-list`, `.pub-title`, `.pub-author`, `.pub-venue`, `.pub-status`, `.pub-extras`
- `content/pubs.md` — delete (replaced by generated `_generated/pubs.md`)
- `docs/authoring.md` — add "Adding a publication" section

### Untouched (by design)

- `_bibliography/pubs.bib` — stays on `pandoc-migration` branch (Jekyll on `source` still reads it). Phase 4 removes it.
- `assets/bibliography/default.bib` — empty file from Phase 1/2 scaffolding; remains unused.
- `scripts/build-content.sh` — already globs `_generated/*.md` (line 74), so `_generated/pubs.md` is picked up automatically.

---

## Task 1: Setup — add `js-yaml` dependency and scaffold files

**Files:**
- Modify: `package.json`
- Create: `scripts/build-pubs.js`
- Create: `test/build-pubs.test.js`

- [ ] **Step 1: Install `js-yaml`**

Run:
```bash
npm install --save-dev js-yaml
```

Expected: `package.json` `devDependencies` now includes `js-yaml`; `package-lock.json` created or updated; `node_modules/` populated. (If `package-lock.json` / `node_modules` are gitignored, only `package.json` needs commit.)

- [ ] **Step 2: Verify `package.json`**

Run `cat package.json`. Expected output includes:
```json
"devDependencies": {
  "esbuild": "^0.25.0",
  "browser-sync": "^3.0.0",
  "js-yaml": "^4.x.x"
}
```

- [ ] **Step 3: Scaffold `scripts/build-pubs.js`**

Create file with content:
```js
#!/usr/bin/env node
// scripts/build-pubs.js
// Reads pubs.yaml and emits:
//   - _generated/pubs.md (Pandoc markdown for the publications page)
//   - assets/bibliography/pubs.bib (generated BibTeX for download)
//
// Pure formatting functions are exported for unit testing.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ------------------------------------------------------------
// Pure helpers (exported for testing)
// ------------------------------------------------------------

// stubs — filled in by later tasks

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

function main() {
  console.log('build-pubs: not yet implemented');
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Scaffold `test/build-pubs.test.js`**

Create file with content:
```js
// test/build-pubs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imports will be added as functions are implemented.

test('scaffold loads', () => {
  assert.ok(true);
});
```

- [ ] **Step 5: Run tests to verify setup**

Run: `npm test`
Expected: all tests pass (only the scaffold test so far).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: scaffold build-pubs.js and add js-yaml dep"
```

---

## Task 2: `stripTitleBraces` and `latexEscape`

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { stripTitleBraces, latexEscape } from '../scripts/build-pubs.js';

test('stripTitleBraces: removes braces', () => {
  assert.equal(
    stripTitleBraces('Ensembling Language Models with Sequential {Monte Carlo}'),
    'Ensembling Language Models with Sequential Monte Carlo'
  );
});

test('stripTitleBraces: no braces unchanged', () => {
  assert.equal(stripTitleBraces('Plain Title'), 'Plain Title');
});

test('stripTitleBraces: nested/multiple braces', () => {
  assert.equal(stripTitleBraces('{ACL} {2021}: {Good} Stuff'), 'ACL 2021: Good Stuff');
});

test('latexEscape: common diacritics', () => {
  assert.equal(latexEscape('Benjamin Van Dürme'), 'Benjamin Van D{\\"u}rme');
  assert.equal(latexEscape('Joāo'), 'Jo{\\~a}o');
  assert.equal(latexEscape('José'), "Jos{\\'e}");
  assert.equal(latexEscape('Montréal'), "Montr{\\'e}al");
});

test('latexEscape: ASCII unchanged', () => {
  assert.equal(latexEscape('Plain ASCII text'), 'Plain ASCII text');
});

test('latexEscape: empty string', () => {
  assert.equal(latexEscape(''), '');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL with "does not provide an export named 'stripTitleBraces'".

- [ ] **Step 3: Implement in `scripts/build-pubs.js`**

Replace the "stubs — filled in by later tasks" comment with:
```js
export function stripTitleBraces(title) {
  return title.replace(/[{}]/g, '');
}

const LATEX_ESCAPES = {
  'ü': '{\\"u}', 'ö': '{\\"o}', 'ä': '{\\"a}', 'Ü': '{\\"U}', 'Ö': '{\\"O}', 'Ä': '{\\"A}',
  'é': "{\\'e}", 'É': "{\\'E}", 'á': "{\\'a}", 'Á': "{\\'A}", 'í': "{\\'i}", 'ó': "{\\'o}", 'ú': "{\\'u}",
  'è': '{\\`e}', 'à': '{\\`a}', 'ì': '{\\`i}', 'ò': '{\\`o}', 'ù': '{\\`u}',
  'ã': '{\\~a}', 'ñ': '{\\~n}', 'õ': '{\\~o}',
  'ç': '{\\c{c}}', 'Ç': '{\\c{C}}',
  'æ': '{\\ae}', 'Æ': '{\\AE}', 'ø': '{\\o}', 'Ø': '{\\O}',
};

export function latexEscape(s) {
  if (!s) return s;
  return s.replace(/./g, (c) => LATEX_ESCAPES[c] ?? c);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: stripTitleBraces + latexEscape helpers"
```

---

## Task 3: Author formatters

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { formatAuthorsHtml, formatAuthorsBibtex } from '../scripts/build-pubs.js';

test('formatAuthorsHtml: single author', () => {
  assert.equal(formatAuthorsHtml(['Jacob Louis Hoover']), 'Jacob Louis Hoover');
});

test('formatAuthorsHtml: two authors', () => {
  assert.equal(
    formatAuthorsHtml(['Jacob Louis Hoover', "Timothy J. O'Donnell"]),
    "Jacob Louis Hoover, Timothy J. O'Donnell"
  );
});

test('formatAuthorsHtml: equal contribution markers', () => {
  assert.equal(
    formatAuthorsHtml(['Alice Smith', 'Bob Jones', 'Carol Lee'], [0, 1]),
    'Alice Smith*, Bob Jones*, Carol Lee'
  );
});

test('formatAuthorsBibtex: single author', () => {
  assert.equal(formatAuthorsBibtex(['Jacob Louis Hoover']), 'Hoover, Jacob Louis');
});

test('formatAuthorsBibtex: two authors joined with "and"', () => {
  assert.equal(
    formatAuthorsBibtex(['Alice Smith', 'Bob Jones']),
    'Smith, Alice and Jones, Bob'
  );
});

test('formatAuthorsBibtex: surname prefix (Van Durme)', () => {
  assert.equal(
    formatAuthorsBibtex(['Benjamin Van Durme']),
    'Van Durme, Benjamin'
  );
});

test('formatAuthorsBibtex: single-name author', () => {
  assert.equal(formatAuthorsBibtex(['Plato']), 'Plato');
});

test('formatAuthorsBibtex: apostrophe in surname', () => {
  assert.equal(
    formatAuthorsBibtex(["Timothy J. O'Donnell"]),
    "O'Donnell, Timothy J."
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL with "does not provide an export named 'formatAuthorsHtml'".

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js` (after `latexEscape`):
```js
export function formatAuthorsHtml(authors, equalContribution = []) {
  const marked = authors.map((a, i) =>
    equalContribution.includes(i) ? `${a}*` : a
  );
  return marked.join(', ');
}

const SURNAME_PREFIXES = new Set(['Van', 'Von', 'De', 'Di', 'Le', 'La', 'El', 'Al', 'Mc', "O'"]);

export function formatAuthorsBibtex(authors) {
  const parts = authors.map((a) => {
    const tokens = a.split(/\s+/);
    if (tokens.length === 1) return tokens[0];
    // Find where the surname starts, scanning backward across prefix words.
    let split = tokens.length - 1;
    while (split > 1 && SURNAME_PREFIXES.has(tokens[split - 1])) {
      split -= 1;
    }
    const last = tokens.slice(split).join(' ');
    const first = tokens.slice(0, split).join(' ');
    return `${last}, ${first}`;
  });
  return parts.join(' and ');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: author formatters (html + bibtex with surname prefixes)"
```

---

## Task 4: URL builders

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import {
  buildPdfUrl, buildArxivUrl, buildLingbuzzUrl, buildDoiUrl, getPrimaryUrl
} from '../scripts/build-pubs.js';

test('buildPdfUrl: relative filename → /assets/pdfs/', () => {
  assert.equal(buildPdfUrl('dissertation.pdf'), '/assets/pdfs/dissertation.pdf');
});

test('buildPdfUrl: absolute URL passes through', () => {
  assert.equal(
    buildPdfUrl('https://example.com/p.pdf'),
    'https://example.com/p.pdf'
  );
});

test('buildArxivUrl: bare id → full URL', () => {
  assert.equal(buildArxivUrl('2603.05432'), 'https://arxiv.org/abs/2603.05432');
});

test('buildArxivUrl: full URL passes through', () => {
  assert.equal(
    buildArxivUrl('https://arxiv.org/abs/2603.05432'),
    'https://arxiv.org/abs/2603.05432'
  );
});

test('buildLingbuzzUrl: bare id → full URL', () => {
  assert.equal(
    buildLingbuzzUrl('000371'),
    'https://ling.auf.net/lingbuzz/000371'
  );
});

test('buildDoiUrl: bare doi → doi.org URL', () => {
  assert.equal(
    buildDoiUrl('10.1162/opmi_a_00086'),
    'https://doi.org/10.1162/opmi_a_00086'
  );
});

test('getPrimaryUrl: prefers links.url', () => {
  assert.equal(getPrimaryUrl({ url: 'http://x', arxiv: '1234' }), 'http://x');
});

test('getPrimaryUrl: falls back to arxiv', () => {
  assert.equal(getPrimaryUrl({ arxiv: '1234' }), 'https://arxiv.org/abs/1234');
});

test('getPrimaryUrl: falls back through preprint, doi_url, openreview', () => {
  assert.equal(getPrimaryUrl({ preprint: 'http://p' }), 'http://p');
  assert.equal(getPrimaryUrl({ doi_url: 'http://d' }), 'http://d');
  assert.equal(getPrimaryUrl({ openreview: 'http://o' }), 'http://o');
});

test('getPrimaryUrl: returns null if no known link', () => {
  assert.equal(getPrimaryUrl({ code: 'http://c' }), null);
  assert.equal(getPrimaryUrl({}), null);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL with "does not provide an export named 'buildPdfUrl'".

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
export function buildPdfUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  return `/assets/pdfs/${path}`;
}

export function buildArxivUrl(input) {
  if (/^https?:\/\//.test(input)) return input;
  return `https://arxiv.org/abs/${input}`;
}

export function buildLingbuzzUrl(id) {
  if (/^https?:\/\//.test(id)) return id;
  return `https://ling.auf.net/lingbuzz/${id}`;
}

export function buildDoiUrl(doi) {
  if (/^https?:\/\//.test(doi)) return doi;
  return `https://doi.org/${doi}`;
}

export function getPrimaryUrl(links) {
  if (!links) return null;
  if (links.url) return links.url;
  if (links.arxiv) return buildArxivUrl(links.arxiv);
  if (links.preprint) return links.preprint;
  if (links.doi_url) return links.doi_url;
  if (links.openreview) return links.openreview;
  return null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: URL builder helpers (pdf, arxiv, lingbuzz, doi, primary)"
```

---

## Task 5: `sortEntries`

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing test**

Append to `test/build-pubs.test.js`:
```js
import { sortEntries } from '../scripts/build-pubs.js';

test('sortEntries: reverse chronological by year, month, day', () => {
  const entries = [
    { id: 'a', year: 2021, month: 3 },
    { id: 'b', year: 2023, month: 7 },
    { id: 'c', year: 2021, month: 11 },
    { id: 'd', year: 2022 },                  // no month, sorts last within year
    { id: 'e', year: 2022, month: 5, day: 2 },
    { id: 'f', year: 2022, month: 5, day: 1 },
  ];
  const sorted = sortEntries(entries).map(e => e.id);
  assert.deepEqual(sorted, ['b', 'e', 'f', 'd', 'c', 'a']);
});

test('sortEntries: does not mutate input', () => {
  const entries = [{ id: 'a', year: 2021 }, { id: 'b', year: 2023 }];
  const before = JSON.stringify(entries);
  sortEntries(entries);
  assert.equal(JSON.stringify(entries), before);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
// Coerce month/day values to integers for sorting.
// Month may be a number (11) or a string ("November" / "Nov" / "11").
const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function monthNum(m) {
  if (m == null) return 0;
  if (typeof m === 'number') return m;
  const lower = String(m).trim().toLowerCase().slice(0, 3);
  return MONTH_NAMES[lower] ?? (Number.parseInt(m, 10) || 0);
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const am = monthNum(a.month), bm = monthNum(b.month);
    if (am !== bm) return bm - am;
    const ad = a.day ?? 0, bd = b.day ?? 0;
    return bd - ad;
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: sortEntries (reverse chron by year/month/day)"
```

---

## Task 6: `validateEntry`

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { validateEntry } from '../scripts/build-pubs.js';

const minimal = {
  id: 'x:2025',
  title: 'T',
  authors: ['A B'],
  year: 2025,
  type: 'article',
  venue: 'Venue',
};

test('validateEntry: minimal entry is valid', () => {
  assert.doesNotThrow(() => validateEntry(minimal));
});

test('validateEntry: missing required field throws', () => {
  for (const key of ['id', 'title', 'authors', 'year', 'type', 'venue']) {
    const bad = { ...minimal };
    delete bad[key];
    assert.throws(() => validateEntry(bad), new RegExp(key));
  }
});

test('validateEntry: rejects unknown type', () => {
  assert.throws(
    () => validateEntry({ ...minimal, type: 'unknown' }),
    /type/
  );
});

test('validateEntry: rejects non-array authors', () => {
  assert.throws(
    () => validateEntry({ ...minimal, authors: 'A B' }),
    /authors/
  );
});

test('validateEntry: rejects out-of-range equal_contribution index', () => {
  assert.throws(
    () => validateEntry({ ...minimal, authors: ['A B'], equal_contribution: [5] }),
    /equal_contribution/
  );
});

test('validateEntry: accepts valid equal_contribution', () => {
  assert.doesNotThrow(() =>
    validateEntry({ ...minimal, authors: ['A B', 'C D'], equal_contribution: [0, 1] })
  );
});

test('validateEntry: rejects links.other entry missing label or url', () => {
  assert.throws(
    () => validateEntry({ ...minimal, links: { other: [{ label: 'x' }] } }),
    /links\.other/
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
const ALLOWED_TYPES = new Set(['article', 'inproceedings', 'thesis', 'misc', 'online']);
const REQUIRED_FIELDS = ['id', 'title', 'authors', 'year', 'type', 'venue'];

export function validateEntry(entry) {
  const id = entry?.id ?? '<unknown>';
  for (const key of REQUIRED_FIELDS) {
    if (entry[key] == null || entry[key] === '') {
      throw new Error(`[${id}] missing required field: ${key}`);
    }
  }
  if (!Array.isArray(entry.authors)) {
    throw new Error(`[${id}] authors must be a list, got ${typeof entry.authors}`);
  }
  if (!ALLOWED_TYPES.has(entry.type)) {
    throw new Error(
      `[${id}] type "${entry.type}" not in ${[...ALLOWED_TYPES].join(', ')}`
    );
  }
  if (entry.equal_contribution) {
    if (!Array.isArray(entry.equal_contribution)) {
      throw new Error(`[${id}] equal_contribution must be a list of indices`);
    }
    for (const idx of entry.equal_contribution) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= entry.authors.length) {
        throw new Error(
          `[${id}] equal_contribution index ${idx} out of range (authors.length=${entry.authors.length})`
        );
      }
    }
  }
  if (entry.links?.other) {
    if (!Array.isArray(entry.links.other)) {
      throw new Error(`[${id}] links.other must be a list`);
    }
    for (const o of entry.links.other) {
      if (!o || !o.label || !o.url) {
        throw new Error(`[${id}] links.other entry missing label or url`);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: validateEntry (required fields, type, equal_contribution, links.other)"
```

---

## Task 7: `generateHtmlEntry`

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { generateHtmlEntry } from '../scripts/build-pubs.js';

const fixture = {
  id: 'hoover.j:2021emnlp',
  title: 'Linguistic Dependencies and Statistical Dependence',
  authors: [
    'Jacob Louis Hoover',
    'Wenyu Du',
    'Alessandro Sordoni',
    "Timothy J. O'Donnell",
  ],
  year: 2021,
  month: 11,
  type: 'inproceedings',
  venue: 'EMNLP 2021',
  venue_url: 'https://aclanthology.org/2021.emnlp-main.234',
  links: {
    code: 'https://github.com/mcqll/cpmi-dependencies',
    slides: '2021.10.11.EMNLP.talk-slides.pdf',
  },
};

test('generateHtmlEntry: contains title, authors, venue, links', () => {
  const html = generateHtmlEntry(fixture);
  assert.match(html, /<li class="pub"/);
  assert.match(html, /Linguistic Dependencies and Statistical Dependence/);
  assert.match(html, /Jacob Louis Hoover/);
  assert.match(html, /Wenyu Du/);
  assert.match(html, /EMNLP 2021/);
  assert.match(html, /href="https:\/\/aclanthology\.org\/2021\.emnlp-main\.234"/);
  assert.match(html, /class="extra code"/);
  assert.match(html, /href="https:\/\/github\.com\/mcqll\/cpmi-dependencies"/);
  assert.match(html, /class="extra slides"/);
  assert.match(html, /href="\/assets\/pdfs\/2021\.10\.11\.EMNLP\.talk-slides\.pdf"/);
});

test('generateHtmlEntry: title unwrapped when no primary URL', () => {
  const noLinks = { ...fixture, venue_url: undefined, links: undefined };
  const html = generateHtmlEntry(noLinks);
  // Title should appear but not inside an <a class="pub-title">
  assert.match(html, /Linguistic Dependencies and Statistical Dependence/);
  assert.doesNotMatch(html, /<a class="pub-title"/);
});

test('generateHtmlEntry: strips title braces for display', () => {
  const braced = { ...fixture, title: 'Sequential {Monte Carlo}' };
  const html = generateHtmlEntry(braced);
  assert.match(html, /Sequential Monte Carlo/);
  assert.doesNotMatch(html, /\{Monte Carlo\}/);
});

test('generateHtmlEntry: renders note in parens', () => {
  const awarded = { ...fixture, note: 'Outstanding Paper Award' };
  const html = generateHtmlEntry(awarded);
  assert.match(html, /\(Outstanding Paper Award\)/);
});

test('generateHtmlEntry: renders status tag', () => {
  const preprint = { ...fixture, status: 'preprint' };
  const html = generateHtmlEntry(preprint);
  assert.match(html, /<span class="pub-status">preprint<\/span>/);
});

test('generateHtmlEntry: renders equal contribution asterisks', () => {
  const eq = { ...fixture, equal_contribution: [0, 1] };
  const html = generateHtmlEntry(eq);
  assert.match(html, /Jacob Louis Hoover\*, Wenyu Du\*/);
});

test('generateHtmlEntry: renders links.other list', () => {
  const withOther = {
    ...fixture,
    links: { ...fixture.links, other: [{ label: 'surprisal explorer', url: 'https://s.io' }] },
  };
  const html = generateHtmlEntry(withOther);
  assert.match(html, /href="https:\/\/s\.io"/);
  assert.match(html, /surprisal explorer/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
// Order of link buttons in the .pub-extras row.
const LINK_RENDERERS = [
  ['arxiv',      (v) => ({ cls: 'arxiv',      label: 'arXiv',      href: buildArxivUrl(v) })],
  ['preprint',   (v) => ({ cls: 'preprint',   label: 'preprint',   href: v })],
  ['pdf',        (v) => ({ cls: 'pdf',        label: 'pdf',        href: buildPdfUrl(v) })],
  ['code',       (v) => ({ cls: 'code',       label: 'code',       href: v })],
  ['slides',     (v) => ({ cls: 'slides',     label: 'slides',     href: buildPdfUrl(v) })],
  ['poster',     (v) => ({ cls: 'poster',     label: 'poster',     href: buildPdfUrl(v) })],
  ['handout',    (v) => ({ cls: 'handout',    label: 'handout',    href: buildPdfUrl(v) })],
  ['video',      (v) => ({ cls: 'video',      label: 'video',      href: v })],
  ['openreview', (v) => ({ cls: 'openreview', label: 'OpenReview', href: v })],
  ['lingbuzz',   (v) => ({ cls: 'lingbuzz',   label: 'lingbuzz',   href: buildLingbuzzUrl(v) })],
];

function renderExtras(links) {
  if (!links) return '';
  const buttons = [];
  for (const [key, fn] of LINK_RENDERERS) {
    if (links[key]) {
      const { cls, label, href } = fn(links[key]);
      buttons.push(`<a class="extra ${cls}" href="${href}">${label}</a>`);
    }
  }
  for (const o of links.other ?? []) {
    buttons.push(`<a class="extra other" href="${o.url}">${o.label}</a>`);
  }
  if (buttons.length === 0) return '';
  return `  <div class="pub-extras">\n    ${buttons.join('\n    ')}\n  </div>\n`;
}

export function generateHtmlEntry(paper) {
  const title = stripTitleBraces(paper.title);
  const authors = formatAuthorsHtml(paper.authors, paper.equal_contribution ?? []);
  const primaryUrl = getPrimaryUrl(paper.links);

  const titleHtml = primaryUrl
    ? `<a class="pub-title" href="${primaryUrl}">${title}</a>`
    : `<span class="pub-title">${title}</span>`;

  const venueHtml = paper.venue_url
    ? `<a class="pub-venue" href="${paper.venue_url}">${paper.venue}</a>`
    : `<span class="pub-venue">${paper.venue}</span>`;

  const noteHtml = paper.note ? ` (${paper.note})` : '';
  const statusHtml = paper.status
    ? ` <span class="pub-status">${paper.status}</span>`
    : '';

  return [
    '<li class="pub">',
    `  ${titleHtml}`,
    `  <span class="pub-author">${authors}</span>`,
    `  ${venueHtml}${statusHtml}${noteHtml}`,
    renderExtras(paper.links),
    '</li>',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: generateHtmlEntry with title/authors/venue/note/status/links"
```

---

## Task 8: `generateBibtexEntry`

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { generateBibtexEntry } from '../scripts/build-pubs.js';

test('generateBibtexEntry: inproceedings entry', () => {
  const bib = generateBibtexEntry({
    id: 'hoover.j:2021emnlp',
    title: 'Linguistic Dependencies and Statistical Dependence',
    authors: ['Jacob Louis Hoover', 'Wenyu Du'],
    year: 2021,
    month: 11,
    type: 'inproceedings',
    venue: 'EMNLP 2021',
    venue_full: 'Proceedings of the 2021 Conference on EMNLP',
    pages: '2941--2963',
    publisher: 'Association for Computational Linguistics',
    links: { url: 'https://aclanthology.org/2021.emnlp-main.234' },
  });
  assert.match(bib, /^@inproceedings\{hoover\.j:2021emnlp,/);
  assert.match(bib, /title = \{Linguistic Dependencies and Statistical Dependence\}/);
  assert.match(bib, /author = \{Hoover, Jacob Louis and Du, Wenyu\}/);
  assert.match(bib, /booktitle = \{Proceedings of the 2021 Conference on EMNLP\}/);
  assert.match(bib, /pages = \{2941--2963\}/);
  assert.match(bib, /publisher = \{Association for Computational Linguistics\}/);
  assert.match(bib, /url = \{https:\/\/aclanthology\.org\/2021\.emnlp-main\.234\}/);
  assert.match(bib, /year = \{2021\}/);
  assert.match(bib, /month = \{11\}/);
  assert.match(bib, /\n\}$/);
});

test('generateBibtexEntry: article with doi', () => {
  const bib = generateBibtexEntry({
    id: 'hoover.j:2023',
    title: 'The Plausibility of Sampling',
    authors: ['Jacob Louis Hoover'],
    year: 2023,
    type: 'article',
    venue: 'Open Mind',
    venue_full: 'Open Mind: Discoveries in Cognitive Science',
    doi: '10.1162/opmi_a_00086',
  });
  assert.match(bib, /^@article\{hoover\.j:2023,/);
  assert.match(bib, /journal = \{Open Mind: Discoveries in Cognitive Science\}/);
  assert.match(bib, /doi = \{10\.1162\/opmi_a_00086\}/);
});

test('generateBibtexEntry: thesis → @phdthesis with school', () => {
  const bib = generateBibtexEntry({
    id: 'hoover.j:2024phd',
    title: 'The Cost of Information',
    authors: ['Jacob Louis Hoover'],
    year: 2024,
    type: 'thesis',
    venue: 'McGill University',
    venue_full: 'McGill University',
  });
  assert.match(bib, /^@phdthesis\{hoover\.j:2024phd,/);
  assert.match(bib, /school = \{McGill University\}/);
});

test('generateBibtexEntry: preserves title braces for capitalization', () => {
  const bib = generateBibtexEntry({
    id: 'chan.r:2026',
    title: 'Ensembling Language Models with Sequential {Monte Carlo}',
    authors: ['Robin Chan'],
    year: 2026,
    type: 'online',
    venue: 'arXiv',
  });
  assert.match(bib, /title = \{Ensembling Language Models with Sequential \{Monte Carlo\}\}/);
});

test('generateBibtexEntry: strips emoji from note', () => {
  const bib = generateBibtexEntry({
    id: 'x',
    title: 'T',
    authors: ['A B'],
    year: 2025,
    type: 'misc',
    venue: 'V',
    note: 'Outstanding Paper Award 🏆',
  });
  assert.match(bib, /note = \{Outstanding Paper Award\}/);
  assert.doesNotMatch(bib, /🏆/);
});

test('generateBibtexEntry: escapes diacritics in author names', () => {
  const bib = generateBibtexEntry({
    id: 'x',
    title: 'T',
    authors: ['Benjamin Van Dürme'],
    year: 2024,
    type: 'misc',
    venue: 'V',
  });
  assert.match(bib, /author = \{Van D\{\\"u\}rme, Benjamin\}/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
// Strip characters from the supplementary-multilingual-plane range used by most
// emoji (covers 🏆 and similar). Does not strip BMP-range symbols.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]/gu;
function stripEmoji(s) {
  return s.replace(EMOJI_RE, '').trim();
}

const BIBTEX_TYPE_MAP = {
  thesis: 'phdthesis',
  // others are identity
};

export function generateBibtexEntry(paper) {
  const btype = BIBTEX_TYPE_MAP[paper.type] ?? paper.type;
  const lines = [`@${btype}{${paper.id},`];
  const push = (key, value) => {
    if (value == null || value === '') return;
    lines.push(`  ${key} = {${value}},`);
  };

  // Title: keep braces for capitalization protection.
  push('title', latexEscape(paper.title));
  push('author', latexEscape(formatAuthorsBibtex(paper.authors)));

  if (paper.type === 'article') {
    push('journal', latexEscape(paper.venue_full ?? paper.venue));
  } else if (paper.type === 'inproceedings') {
    push('booktitle', latexEscape(paper.venue_full ?? paper.venue));
  } else if (paper.type === 'thesis') {
    push('school', latexEscape(paper.venue_full ?? paper.venue));
  } else {
    // misc / online — howpublished uses the venue label if distinct from URL.
    if (paper.venue_full) push('howpublished', latexEscape(paper.venue_full));
  }

  push('year', paper.year);
  push('month', paper.month);
  push('day', paper.day);
  push('pages', paper.pages);
  push('publisher', latexEscape(paper.publisher));
  push('address', latexEscape(paper.address));
  push('editor', latexEscape(paper.editor));
  push('doi', paper.doi);

  const primaryUrl = getPrimaryUrl(paper.links);
  push('url', primaryUrl);

  if (paper.note) {
    const cleanNote = stripEmoji(paper.note);
    if (cleanNote) push('note', latexEscape(cleanNote));
  }

  lines.push('}');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: generateBibtexEntry with type mapping, escapes, emoji stripping"
```

---

## Task 9: Document generators

**Files:**
- Modify: `scripts/build-pubs.js`
- Modify: `test/build-pubs.test.js`

- [ ] **Step 1: Write failing tests**

Append to `test/build-pubs.test.js`:
```js
import { generateMarkdown, generateBibtexFile } from '../scripts/build-pubs.js';

const entries = [
  {
    id: 'a', title: 'A', authors: ['X Y'], year: 2023, type: 'article',
    venue: 'V', links: { url: 'http://a' },
  },
  {
    id: 'b', title: 'B', authors: ['P Q', 'R S'], year: 2022, type: 'misc',
    venue: 'W', equal_contribution: [0, 1],
  },
];

test('generateMarkdown: has front matter and pub-list', () => {
  const md = generateMarkdown(entries);
  assert.match(md, /^---\ntitle: research\npage-style: site\n---/);
  assert.match(md, /<ul class="pub-list">/);
  assert.match(md, /<li class="pub">/);
  // Google Scholar + BibTeX links in header
  assert.match(md, /scholar\.google\.com/);
  assert.match(md, /href="\/assets\/bibliography\/pubs\.bib"/);
  // Name change note at bottom
  assert.match(md, /surname is Vigly/);
});

test('generateMarkdown: equal-contribution footnote only when used', () => {
  const md = generateMarkdown(entries);
  assert.match(md, /\* Equal contribution/);
  const mdNoEq = generateMarkdown([entries[0]]);
  assert.doesNotMatch(mdNoEq, /\* Equal contribution/);
});

test('generateBibtexFile: concatenates entries separated by blank lines', () => {
  const bib = generateBibtexFile(entries);
  assert.match(bib, /^@article\{a,/);
  assert.match(bib, /@misc\{b,/);
  // Two entries separated by \n\n
  const chunks = bib.trim().split(/\n\n/);
  assert.equal(chunks.length, 2);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/build-pubs.js`:
```js
const GOOGLE_SCHOLAR_URL =
  'https://scholar.google.com/citations?user=koLi2TwAAAAJ';

const NAME_NOTE = `*Note on my name:* My surname is Vigly. Prior to September 2024, my surname was Hoover, which is now a middle name.`;

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
    '',
    '```{=html}',
    '<ul class="pub-list">',
    items,
    '</ul>',
    '```',
    '',
  ];
  if (hasEqual) {
    parts.push('<p class="pub-footnote">* Equal contribution</p>', '');
  }
  parts.push('---', '', NAME_NOTE, '');
  return parts.join('\n');
}

export function generateBibtexFile(entries) {
  return entries.map(generateBibtexEntry).join('\n\n') + '\n';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pubs.js test/build-pubs.test.js
git commit -m "Phase 3: generateMarkdown + generateBibtexFile document wrappers"
```

---

## Task 10: `main()` — glue + CLI

**Files:**
- Modify: `scripts/build-pubs.js`

- [ ] **Step 1: Replace the placeholder `main()` with a real implementation**

Replace:
```js
function main() {
  console.log('build-pubs: not yet implemented');
}
```

With:
```js
function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function warnMissingPdfs(entries) {
  for (const e of entries) {
    const links = e.links ?? {};
    for (const key of ['pdf', 'slides', 'poster', 'handout']) {
      const val = links[key];
      if (!val || /^https?:\/\//.test(val)) continue;
      const full = resolve('assets/pdfs', val);
      if (!existsSync(full)) {
        console.warn(`[${e.id}] warning: ${key} file not found at ${full}`);
      }
    }
  }
}

function main() {
  const raw = readFileSync('pubs.yaml', 'utf8');
  const entries = yaml.load(raw);
  if (!Array.isArray(entries)) {
    console.error('pubs.yaml must be a list of entries');
    process.exit(1);
  }
  try {
    entries.forEach(validateEntry);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  warnMissingPdfs(entries);

  const sorted = sortEntries(entries);

  ensureDir('_generated');
  writeFileSync('_generated/pubs.md', generateMarkdown(sorted));
  console.log(`Generated: _generated/pubs.md (${sorted.length} entries)`);

  ensureDir('assets/bibliography');
  writeFileSync('assets/bibliography/pubs.bib', generateBibtexFile(sorted));
  console.log(`Generated: assets/bibliography/pubs.bib (${sorted.length} entries)`);
}
```

- [ ] **Step 2: Run the script against a temporary yaml to confirm CLI wiring**

Create a temporary `$TMPDIR/pubs-smoke.yaml`:
```bash
mkdir -p "$TMPDIR/pubs-smoke" && cat > "$TMPDIR/pubs-smoke/pubs.yaml" <<'YAML'
- id: smoke:2025
  title: Smoke Test
  authors: ['Alice Example']
  year: 2025
  type: misc
  venue: Local
  links:
    url: http://example.com
YAML
```

Run (from that temp dir, which bypasses file deps):
```bash
cd "$TMPDIR/pubs-smoke" && node /Users/v/Websites/jahoo.github.io/scripts/build-pubs.js
```

Expected stdout:
```
Generated: _generated/pubs.md (1 entries)
Generated: assets/bibliography/pubs.bib (1 entries)
```

Then verify output:
```bash
cat "$TMPDIR/pubs-smoke/_generated/pubs.md"
cat "$TMPDIR/pubs-smoke/assets/bibliography/pubs.bib"
```

Expected: markdown with the Smoke Test entry, and a `@misc{smoke:2025, …}` BibTeX block.

- [ ] **Step 3: Clean up smoke dir**

```bash
cd /Users/v/Websites/jahoo.github.io && trash "$TMPDIR/pubs-smoke"
```

(Run with `dangerouslyDisableSandbox: true` since `trash` writes to `~/.Trash`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/build-pubs.js
git commit -m "Phase 3: main() reads pubs.yaml, writes pubs.md + pubs.bib"
```

---

## Task 11: Migrate `_bibliography/pubs.bib` → `pubs.yaml`

**Files:**
- Create: `pubs.yaml`

- [ ] **Step 1: Create `pubs.yaml` at repo root**

Translate all 9 entries from `_bibliography/pubs.bib`. Use the schema in `docs/superpowers/specs/2026-04-17-phase3-publications-page.md`. The file order will be re-sorted by the build, but writing newest-first is easiest to read.

Full content:
```yaml
# Publications, newest first.
# Schema: see docs/superpowers/specs/2026-04-17-phase3-publications-page.md
#
# Required: id, title, authors, year, type, venue
# Optional: month, day, venue_full, venue_url, pages, publisher, address,
#           doi, editor, school, note, status, equal_contribution, links

- id: chan.r:2026arxiv
  title: "Ensembling {Language Models} with Sequential {Monte Carlo}"
  authors:
    - Robin Shing Moon Chan
    - Tianyu Liu
    - Samuel Kiegeland
    - Clemente Pasti
    - Jacob Hoover Vigly
    - Timothy J. O'Donnell
    - Ryan Cotterell
    - Tim Vieira
  year: 2026
  month: 3
  day: 5
  type: online
  venue: arXiv
  venue_full: "arXiv:2603.05432"
  status: preprint
  links:
    arxiv: "2603.05432"

- id: lipkin.b:2025
  title: "Fast Controlled Generation from Language Models with Adaptive Weighted Rejection Sampling"
  authors:
    - Ben Lipkin
    - Benjamin LeBrun
    - Jacob Hoover Vigly
    - João Loula
    - David R. MacIver
    - Li Du
    - Jason Eisner
    - Ryan Cotterell
    - Vikash Mansinghka
    - Timothy J. O'Donnell
    - Alexander K. Lew
    - Tim Vieira
  year: 2025
  month: 10
  day: 7
  type: misc
  venue: CoLM 2025
  venue_full: "Second Conference on Language Modeling ({{COLM}})"
  address: Montréal
  note: "Outstanding Paper Award"
  links:
    url: https://openreview.net/forum?id=3BmPSFAdq3
    arxiv: "2504.05410"
    openreview: https://openreview.net/forum?id=3BmPSFAdq3

- id: vigly.j:2025cogsci
  title: "When Unpredictable Does Not Mean Difficult to Process"
  authors:
    - Jacob Hoover Vigly
    - Peng Qian
    - Morgan Sonderegger
    - Timothy J. O'Donnell
  year: 2025
  month: 7
  day: 31
  type: misc
  venue: CogSci 2025
  venue_full: "Annual Meeting of the Cognitive Science Society"
  address: "San Francisco, CA"
  links:
    poster: https://underline.io/events/489/posters/20440/poster/119457-

- id: vigly.j:2025psyarxiv
  title: "Comprehension Effort as the Cost of Inference"
  authors:
    - Jacob Hoover Vigly
    - Peng Qian
    - Morgan Sonderegger
    - Timothy J. O'Donnell
  year: 2025
  month: 6
  day: 18
  type: online
  venue: PsyArXiv
  status: preprint
  links:
    url: https://osf.io/2498w
    preprint: https://osf.io/2498w

- id: hoover.j:2024phd
  title: "The Cost of Information: Looking beyond Predictability in Language Processing"
  authors:
    - Jacob Louis Hoover
  year: 2024
  month: 8
  type: thesis
  venue: McGill University
  venue_full: McGill University
  links:
    url: https://escholarship.mcgill.ca/concern/theses/r494vr42w
    pdf: dissertation.pdf
    other:
      - label: précis
        url: /assets/pdfs/dissertation_precis.pdf

- id: hoover.j:2023
  title: "The Plausibility of Sampling as an Algorithmic Theory of Sentence Processing"
  authors:
    - Jacob Louis Hoover
    - Morgan Sonderegger
    - Steven T. Piantadosi
    - Timothy J. O'Donnell
  year: 2023
  month: 7
  type: article
  venue: Open Mind
  venue_full: "Open Mind: Discoveries in Cognitive Science"
  venue_url: https://doi.org/10.1162/opmi_a_00086
  doi: 10.1162/opmi_a_00086
  pages: "350--391"
  links:
    preprint: https://doi.org/10.31234/osf.io/qjnpv
    code: https://github.com/mcqll/plausibility-sampling-processing/
    other:
      - label: surprisal explorer
        url: https://jahoo.shinyapps.io/surprisal_explorer/

- id: socolof.m:2022coling
  title: "Measuring Morphological Fusion Using Partial Information Decomposition"
  authors:
    - Michaela Socolof
    - Jacob Louis Hoover
    - Richard Futrell
    - Alessandro Sordoni
    - Timothy J. O'Donnell
  year: 2022
  month: 10
  day: 12
  type: inproceedings
  venue: COLING 2022
  venue_full: "Proceedings of the 29th International Conference on Computational Linguistics (COLING)"
  venue_url: https://aclanthology.org/2022.coling-1.5
  address: "Gyeongju, Republic of Korea"
  pages: "44--54"
  publisher: International Committee on Computational Linguistics

- id: hoover.j:2021emnlp
  title: "Linguistic Dependencies and Statistical Dependence"
  authors:
    - Jacob Louis Hoover
    - Wenyu Du
    - Alessandro Sordoni
    - Timothy J. O'Donnell
  year: 2021
  month: 11
  type: inproceedings
  venue: EMNLP 2021
  venue_full: "Proceedings of the 2021 Conference on Empirical Methods in Natural Language Processing"
  venue_url: https://aclanthology.org/2021.emnlp-main.234
  address: "Online and Punta Cana, Dominican Republic"
  pages: "2941--2963"
  publisher: Association for Computational Linguistics
  links:
    code: https://github.com/mcqll/cpmi-dependencies
    slides: 2021.10.11.EMNLP.talk-slides.pdf
    poster: 2021.10.11.EMNLP.poster.pdf

- id: hoover.j:2021wccfl
  title: "Accounting for Variation in Number Agreement in Icelandic Dative-Nominative Constructions"
  authors:
    - Jacob Louis Hoover
  year: 2021
  month: 10
  type: inproceedings
  venue: WCCFL 38
  venue_full: "Proceedings of the 38th West Coast Conference on Formal Linguistics"
  venue_url: http://www.lingref.com/cpp/wccfl/38/abstract3568.html
  editor: "Rachel Soo, Una Y. Chow, Sander Nederveen"
  pages: "231--241"
  publisher: Cascadilla Proceedings Project
  address: "Somerville, Mass., USA"
  links:
    pdf: wccfl2020-cascadilla-paper3568-proof.pdf
    handout: wccfl2020-handout.pdf
```

- [ ] **Step 2: Run the build script**

Run: `node scripts/build-pubs.js`
Expected:
```
Generated: _generated/pubs.md (9 entries)
Generated: assets/bibliography/pubs.bib (9 entries)
```
Possible warnings about missing PDFs — investigate each (actual file may be under different name in `assets/pdfs/`).

- [ ] **Step 3: Eyeball the outputs**

```bash
head -80 _generated/pubs.md
head -40 assets/bibliography/pubs.bib
```

Expected: front matter + Google Scholar/BibTeX links + `<ul class="pub-list">` with 9 `<li class="pub">` entries; `.bib` starts with `@online{chan.r:2026arxiv, …}`.

- [ ] **Step 4: Commit**

```bash
git add pubs.yaml _generated/pubs.md assets/bibliography/pubs.bib
git commit -m "Phase 3: migrate pubs.bib → pubs.yaml (9 entries)"
```

(If `_generated/` or `assets/bibliography/pubs.bib` are gitignored, exclude them — the build regenerates them. Check `.gitignore` first with `git check-ignore -v _generated/pubs.md`.)

---

## Task 12: Makefile integration

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add `pubs` target and include it in `generate`**

Edit `Makefile`. Replace:
```makefile
.PHONY: all clean content js assets static-html serve test generate

all: generate content js assets static-html

# ---- Generate listing ----
generate:
	@pandoc lua scripts/build-index.lua
```

With:
```makefile
.PHONY: all clean content js assets static-html serve test generate pubs

all: generate content js assets static-html

# ---- Generate listing + publications ----
generate: pubs
	@pandoc lua scripts/build-index.lua

pubs:
	@node scripts/build-pubs.js
```

(Ordering: `pubs` runs as a prerequisite of `generate` so `_generated/pubs.md` exists before `build-content.sh` runs.)

- [ ] **Step 2: Run `make clean && make` to verify full build**

Run: `make clean && make`
Expected: no errors, includes output lines like `Generated: _generated/pubs.md (9 entries)` and `Build: _generated/pubs.md` as Pandoc compiles it.

- [ ] **Step 3: Verify the compiled page**

```bash
ls _site/pubs/index.html
head -40 _site/pubs/index.html
```

Expected: Pandoc-compiled page with navbar, publications list, Google Scholar link, BibTeX link.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "Phase 3: Makefile integrates pubs build into generate target"
```

---

## Task 13: `make serve` watcher integration

**Files:**
- Modify: `scripts/serve.sh`

- [ ] **Step 1: Add `pubs.yaml` and `scripts/` to the watcher and handle the `pubs.yaml` case**

Edit `scripts/serve.sh`. Locate the `fswatch` invocation (around line 45):
```bash
"$FSWATCH" -r --event Updated \
    content/ filters/ templates/ assets/css/ assets/fonts/ site.yaml \
    2>/dev/null \
```

Replace with:
```bash
"$FSWATCH" -r --event Updated \
    content/ filters/ templates/ assets/css/ assets/fonts/ site.yaml pubs.yaml scripts/ \
    2>/dev/null \
```

Then in the `case "$changed" in` block, add a handler for `pubs.yaml` and `build-pubs.js`. Replace:
```bash
        *.md)
            rel="${changed#$(pwd)/}"
            echo "Content changed: $rel"
            # Rebuild listing + all content (build-content.sh is incremental)
            pandoc lua scripts/build-index.lua 2>/dev/null || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
```

With:
```bash
        *pubs.yaml|*build-pubs.js)
            echo "Pubs changed — regenerating pubs.md + pubs.bib"
            node scripts/build-pubs.js || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
        *.md)
            rel="${changed#$(pwd)/}"
            echo "Content changed: $rel"
            # Rebuild listing + all content (build-content.sh is incremental)
            pandoc lua scripts/build-index.lua 2>/dev/null || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
```

- [ ] **Step 2: Smoke-test the watcher**

Run: `make serve` (background, or in a separate terminal).
Touch `pubs.yaml`:
```bash
touch pubs.yaml
```
Expected: log line "Pubs changed — regenerating pubs.md + pubs.bib" followed by the Pandoc rebuild.

Stop the server (Ctrl-C in the serve terminal, or `kill` the background PID).

- [ ] **Step 3: Commit**

```bash
git add scripts/serve.sh
git commit -m "Phase 3: serve.sh watches pubs.yaml and scripts/build-pubs.js"
```

---

## Task 14: Styling

**Files:**
- Modify: `assets/css/site.css`

- [ ] **Step 1: Append pub-list styles**

Append to `assets/css/site.css`:
```css
/* ── Publications list ──────────────────────────────── */

body.page-style-site .pub-list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0;
}
body.page-style-site .pub-list li.pub {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--s-border);
}
body.page-style-site .pub-list li.pub:last-child {
  border-bottom: none;
}
body.page-style-site .pub-title {
  font-family: 'Linux Libertine', 'Computer Modern Serif', Times, serif;
  font-weight: 600;
  font-size: 1.1rem;
  display: block;
  margin-bottom: 0.2rem;
  color: var(--s-accent-warm, #424242);
}
body.page-style-site a.pub-title:hover {
  text-decoration: underline;
}
body.page-style-site .pub-author {
  display: block;
  font-size: 0.95rem;
  color: #555;
  margin-bottom: 0.2rem;
}
body.page-style-site .pub-venue {
  font-style: italic;
  color: #333;
}
body.page-style-site .pub-status {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0 0.4rem;
  background: #eee;
  color: #555;
  font-size: 0.75rem;
  border-radius: 2px;
  text-transform: lowercase;
}
body.page-style-site .pub-extras {
  margin-top: 0.3rem;
  font-size: 0.875rem;
}
body.page-style-site .pub-extras .extra {
  margin-right: 0.25rem;
  color: #2a7ae2;
}
body.page-style-site .pub-extras .extra::before { content: '['; color: #888; }
body.page-style-site .pub-extras .extra::after  { content: ']'; color: #888; }
body.page-style-site .pub-footnote {
  font-size: 0.85rem;
  color: #777;
  margin-top: 0.5rem;
}
body.page-style-site ul.social-media-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}
body.page-style-site ul.social-media-list li {
  display: inline-block;
  margin-right: 0.75rem;
}
```

- [ ] **Step 2: Rebuild and visually check**

Run: `make` (or the still-running `make serve`).
Open `http://localhost:4000/pubs/` in a browser.
Expected: entries render with title, authors, venue; link buttons appear in `[bracketed]` style; status tags on preprints; Google Scholar + BibTeX links at top; name note at bottom.

- [ ] **Step 3: Commit**

```bash
git add assets/css/site.css
git commit -m "Phase 3: pub-list styling in site.css"
```

---

## Task 15: Remove placeholder and update authoring guide

**Files:**
- Delete: `content/pubs.md`
- Modify: `docs/authoring.md`

- [ ] **Step 1: Remove the placeholder `content/pubs.md`**

Confirm `_site/pubs/index.html` now comes from `_generated/pubs.md` (it should, since `build-content.sh` builds both `content/*.md` and `_generated/*.md` into `_site/$basename/index.html`; if both exist, the later loop clobbers the earlier).

Run:
```bash
trash content/pubs.md
make
```

(Run `trash` with `dangerouslyDisableSandbox: true`.)

Verify:
```bash
head -20 _site/pubs/index.html
```

Expected: still renders the full publications list (not the "coming soon" placeholder).

- [ ] **Step 2: Add "Adding a publication" section to `docs/authoring.md`**

Append to `docs/authoring.md`:
```markdown
## Adding a publication

The publications page is generated from `pubs.yaml` at the repo root.

Add a new entry at the top of the list:

```yaml
- id: surname.f:YEARkey              # unique, used as BibTeX cite key
  title: "Paper Title with {Braces} around Proper Nouns"
  authors:
    - First Last
    - First Middle Last
  year: 2026
  month: 4                           # integer or name; optional but used for sort
  type: inproceedings                # article | inproceedings | thesis | misc | online
  venue: ACL 2026                    # short label shown on the page
  venue_full: "Proceedings of …"     # full name for BibTeX
  venue_url: https://…               # link for the venue label
  pages: "123--145"
  publisher: …
  note: "Outstanding Paper Award"    # optional; shown in parens after venue
  status: preprint                   # optional; shown as a small tag
  equal_contribution: [0, 1]         # optional; 0-based author indices
  links:
    url: https://…                   # primary link for the title
    arxiv: "2603.05432"              # bare id or full URL
    code: https://github.com/…
    slides: talk-slides.pdf          # bare filename → /assets/pdfs/; URL passes through
    poster: poster.pdf
    pdf: paper.pdf
    preprint: https://…
    openreview: https://…
    lingbuzz: "000371"
    video: https://…
    other:
      - label: "explorer"
        url: https://…
```

Braces in `title` protect words from BibTeX capitalization rules; they're stripped for the HTML display.

Run `make` (or save while `make serve` is running) to regenerate the page.

The build also writes `assets/bibliography/pubs.bib` — readers can click the "BibTeX" link at the top of the page to download it.

### Validation

`scripts/build-pubs.js` validates the YAML:
- Required fields present (`id`, `title`, `authors`, `year`, `type`, `venue`)
- `type` is one of the allowed values
- `equal_contribution` indices are in range
- `links.other` entries have both `label` and `url`

It also warns (not errors) if `pdf`/`slides`/`poster`/`handout` references a file not found under `assets/pdfs/`.
```

- [ ] **Step 3: Commit**

```bash
git add content/pubs.md docs/authoring.md
git commit -m "Phase 3: remove pubs placeholder + document pubs.yaml workflow"
```

(`git add content/pubs.md` stages the deletion.)

---

## Task 16: Final verification

- [ ] **Step 1: Clean build from scratch**

```bash
make clean
make test
make
```

Expected: all tests pass; `make` completes without errors; log includes "Generated: _generated/pubs.md (9 entries)" and "Build: _generated/pubs.md".

- [ ] **Step 2: Browse all pages**

Start `make serve`, visit:
- `http://localhost:4000/` — index page
- `http://localhost:4000/posts/` — listing
- `http://localhost:4000/pubs/` — new publications page
- Click through a few publications (title links, arXiv buttons, code buttons, PDF buttons)
- Download the BibTeX link and spot-check the content

Expected: all pages render, all links work, PDFs/slides load, BibTeX file downloads cleanly.

- [ ] **Step 3: Verify round-trip via a BibTeX parser (manual spot check)**

Open `assets/bibliography/pubs.bib` in a BibTeX-aware editor or paste into https://flamingtempura.github.io/bibtex-tidy/ — confirm no syntax errors and all 9 entries parse.

- [ ] **Step 4: No new commits for verification, unless fixes are needed**

If any issues surface, fix inline and commit as a follow-up:
```bash
git add <files>
git commit -m "Phase 3: fix <issue>"
```

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Source schema (`pubs.yaml`) | 11 (migration), 15 (docs) |
| Build script — Load + validate | 6 (validate), 10 (main) |
| Build script — Sort entries | 5 |
| Build script — HTML generation | 7 |
| Build script — BibTeX generation | 8 |
| Build script — Document wrappers | 9 |
| Pure helper functions (stripTitleBraces, latexEscape, formatAuthors*, build*Url, getPrimaryUrl) | 2, 3, 4 |
| Makefile integration | 12 |
| `make serve` watcher | 13 |
| Styling | 14 |
| Testing (unit tests for pure fns) | 2–9 (each has tests) |
| Migration | 11 |
| Cleanup (placeholder removal) | 15 |
| Authoring guide update | 15 |

No gaps.
