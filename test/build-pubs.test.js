// test/build-pubs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripTitleBraces, latexEscape } from '../scripts/build-pubs.js';
import { formatAuthorsHtml, formatAuthorsBibtex } from '../scripts/build-pubs.js';
import {
  buildPdfUrl, buildArxivUrl, buildLingbuzzUrl, buildDoiUrl, getPrimaryUrl
} from '../scripts/build-pubs.js';
import { sortEntries } from '../scripts/build-pubs.js';
import { validateEntry } from '../scripts/build-pubs.js';
import { generateHtmlEntry } from '../scripts/build-pubs.js';
import { generateBibtexEntry } from '../scripts/build-pubs.js';

// Imports will be added as functions are implemented.

test('scaffold loads', () => {
  assert.ok(true);
});

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
  assert.equal(latexEscape('João'), 'Jo{\\~a}o');
  assert.equal(latexEscape('José'), "Jos{\\'e}");
  assert.equal(latexEscape('Montréal'), "Montr{\\'e}al");
});

test('latexEscape: ASCII unchanged', () => {
  assert.equal(latexEscape('Plain ASCII text'), 'Plain ASCII text');
});

test('latexEscape: empty string', () => {
  assert.equal(latexEscape(''), '');
});

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

test('sortEntries: reverse chronological by year, month, day', () => {
  const entries = [
    { id: 'a', year: 2021, month: 3 },
    { id: 'b', year: 2023, month: 7 },
    { id: 'c', year: 2021, month: 11 },
    { id: 'd', year: 2022 },
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

const minimalEntry = {
  id: 'x:2025',
  title: 'T',
  authors: ['A B'],
  year: 2025,
  type: 'article',
  venue: 'Venue',
};

test('validateEntry: minimal entry is valid', () => {
  assert.doesNotThrow(() => validateEntry(minimalEntry));
});

test('validateEntry: missing required field throws', () => {
  for (const key of ['id', 'title', 'authors', 'year', 'type', 'venue']) {
    const bad = { ...minimalEntry };
    delete bad[key];
    assert.throws(() => validateEntry(bad), new RegExp(key));
  }
});

test('validateEntry: rejects unknown type', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, type: 'unknown' }),
    /type/
  );
});

test('validateEntry: rejects non-array authors', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, authors: 'A B' }),
    /authors/
  );
});

test('validateEntry: rejects out-of-range equal_contribution index', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, authors: ['A B'], equal_contribution: [5] }),
    /equal_contribution/
  );
});

test('validateEntry: accepts valid equal_contribution', () => {
  assert.doesNotThrow(() =>
    validateEntry({ ...minimalEntry, authors: ['A B', 'C D'], equal_contribution: [0, 1] })
  );
});

test('validateEntry: rejects links.other entry missing label or url', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, links: { other: [{ label: 'x' }] } }),
    /links\.other/
  );
});

const htmlFixture = {
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
  const html = generateHtmlEntry(htmlFixture);
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
  const noLinks = { ...htmlFixture, venue_url: undefined, links: undefined };
  const html = generateHtmlEntry(noLinks);
  assert.match(html, /Linguistic Dependencies and Statistical Dependence/);
  assert.doesNotMatch(html, /<a class="pub-title"/);
});

test('generateHtmlEntry: strips title braces for display', () => {
  const braced = { ...htmlFixture, title: 'Sequential {Monte Carlo}' };
  const html = generateHtmlEntry(braced);
  assert.match(html, /Sequential Monte Carlo/);
  assert.doesNotMatch(html, /\{Monte Carlo\}/);
});

test('generateHtmlEntry: renders note in parens', () => {
  const awarded = { ...htmlFixture, note: 'Outstanding Paper Award' };
  const html = generateHtmlEntry(awarded);
  assert.match(html, /\(Outstanding Paper Award\)/);
});

test('generateHtmlEntry: renders status tag', () => {
  const preprint = { ...htmlFixture, status: 'preprint' };
  const html = generateHtmlEntry(preprint);
  assert.match(html, /<span class="pub-status">preprint<\/span>/);
});

test('generateHtmlEntry: renders equal contribution asterisks', () => {
  const eq = { ...htmlFixture, equal_contribution: [0, 1] };
  const html = generateHtmlEntry(eq);
  assert.match(html, /Jacob Louis Hoover\*, Wenyu Du\*/);
});

test('generateHtmlEntry: renders links.other list', () => {
  const withOther = {
    ...htmlFixture,
    links: { ...htmlFixture.links, other: [{ label: 'surprisal explorer', url: 'https://s.io' }] },
  };
  const html = generateHtmlEntry(withOther);
  assert.match(html, /href="https:\/\/s\.io"/);
  assert.match(html, /surprisal explorer/);
});

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
