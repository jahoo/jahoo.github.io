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

test('cslAuthorsToStrings: undefined/null returns empty array', () => {
  assert.deepEqual(cslAuthorsToStrings(undefined), []);
  assert.deepEqual(cslAuthorsToStrings(null), []);
});

import { adaptEntry } from '../scripts/build-pubs-bib.js';

// A hand-crafted CSL-JSON entry for an inproceedings paper
// (shape observed in Task 1's citation-js smoke-test).
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

test('adaptEntry: thesis uses publisher as school (not duplicated)', () => {
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
  // thesis publisher is the school; don't also set entry.publisher
  assert.equal(e.publisher, undefined);
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

test('adaptEntry: links.arxiv from arxivEprints map (3rd arg)', () => {
  // citation-js drops biblatex eprint/eprinttype; we recover via the map
  const cslWebpage = {
    id: 'qux:2025arxiv',
    type: 'webpage',
    title: 'A Preprint',
    author: [{ given: 'Preprint', family: 'Writer' }],
    issued: { 'date-parts': [[2025]] },
  };
  const arxivMap = new Map([['qux:2025arxiv', '2501.12345']]);
  const e = adaptEntry(cslWebpage, {}, arxivMap);
  assert.equal(e.links.arxiv, '2501.12345');
});

test('adaptEntry: extras.links.arxiv overrides map', () => {
  const cslWebpage = {
    id: 'qux:2025arxiv',
    type: 'webpage',
    title: 'A Preprint',
    author: [{ given: 'P', family: 'W' }],
    issued: { 'date-parts': [[2025]] },
  };
  const arxivMap = new Map([['qux:2025arxiv', '2501.12345']]);
  const e = adaptEntry(cslWebpage, { links: { arxiv: '2600.99999' } }, arxivMap);
  assert.equal(e.links.arxiv, '2600.99999');
});

test('adaptEntry: no arxivMap → no links.arxiv', () => {
  const cslWebpage = {
    id: 'xyz',
    type: 'webpage',
    title: 'T',
    author: [{ given: 'A', family: 'B' }],
    issued: { 'date-parts': [[2025]] },
  };
  const e = adaptEntry(cslWebpage, {});
  assert.equal(e.links?.arxiv, undefined);
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

test('adaptEntry: misc type (document) passes through', () => {
  const cslMisc = {
    id: 'quux:2022poster',
    type: 'document',
    title: 'A Poster',
    author: [{ given: 'P', family: 'P' }],
    issued: { 'date-parts': [[2022]] },
    publisher: 'Poster at Some Meeting',
  };
  const e = adaptEntry(cslMisc, {});
  assert.equal(e.type, 'misc');
  assert.equal(e.publisher, 'Poster at Some Meeting');
});
