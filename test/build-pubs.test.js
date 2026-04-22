// test/build-pubs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, writeFileSync, mkdirSync, symlinkSync, rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  stripTitleBraces,
  escapeHtml,
  formatAuthorsHtml,
  buildPdfUrl, buildArxivUrl, buildLingbuzzUrl, buildDoiUrl, getPrimaryUrl,
  labelForUrl, labelForPrimary,
  sortEntries,
  validateEntry,
  generateHtmlEntry,
  generatePubList,
  expandHome, loadBibSource,
  parseBib, indexByKey, extractArxivEprints, extractEntriesByKey,
  mapCslType,
  cslAuthorsToStrings,
  adaptEntry,
  stripLeakyFields,
} from '../scripts/build-pubs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_BIB = readFileSync(
  resolve(__dirname, 'fixtures/sample.bib'),
  'utf8'
);

// ------------------------------------------------------------
// Text helpers
// ------------------------------------------------------------

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

test('escapeHtml: escapes <, >, &, ", \'', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml('plain text'), 'plain text');
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: null/undefined passes through', () => {
  assert.equal(escapeHtml(null), null);
  assert.equal(escapeHtml(undefined), undefined);
});

test('formatAuthorsHtml: single author', () => {
  assert.equal(formatAuthorsHtml(['Jacob Louis Hoover']), 'Jacob Louis Hoover');
});

test('formatAuthorsHtml: two authors (apostrophes in names are escaped)', () => {
  assert.equal(
    formatAuthorsHtml(['Jacob Louis Hoover', "Timothy J. O'Donnell"]),
    'Jacob Louis Hoover, Timothy J. O&#39;Donnell'
  );
});

test('formatAuthorsHtml: co_first marks first N authors with superscript ∗', () => {
  const html = formatAuthorsHtml(['Alice Smith', 'Bob Jones', 'Carol Lee'], 2);
  assert.match(html, /Alice Smith<sup[^>]*>∗<\/sup>, Bob Jones<sup[^>]*>∗<\/sup>, Carol Lee$/);
});

test('formatAuthorsHtml: co_last marks last M authors with superscript ‡', () => {
  const html = formatAuthorsHtml(['Alice Smith', 'Bob Jones', 'Carol Lee'], 0, 2);
  assert.match(html, /^Alice Smith, Bob Jones<sup[^>]*>‡<\/sup>, Carol Lee<sup[^>]*>‡<\/sup>$/);
});

test('formatAuthorsHtml: mark <sup>s carry a title tooltip', () => {
  const html = formatAuthorsHtml(['A', 'B'], 1, 1);
  assert.match(html, /<sup[^>]*title="∗ Co-first author"[^>]*>∗<\/sup>/);
  assert.match(html, /<sup[^>]*title="‡ Co-senior author"[^>]*>‡<\/sup>/);
});

test('formatAuthorsHtml: co_first and co_last can overlap (both marks)', () => {
  const html = formatAuthorsHtml(['Alice', 'Bob'], 2, 2);
  assert.match(html, /Alice<sup[^>]*>∗<\/sup><sup[^>]*>‡<\/sup>, Bob<sup[^>]*>∗<\/sup><sup[^>]*>‡<\/sup>/);
});

test('formatAuthorsHtml: defaults to no marks', () => {
  assert.equal(
    formatAuthorsHtml(['Alice Smith', 'Bob Jones']),
    'Alice Smith, Bob Jones'
  );
});

test('formatAuthorsHtml: escapes HTML-unsafe chars in names', () => {
  assert.match(
    formatAuthorsHtml(['Alice & Co']),
    /^Alice &amp; Co$/
  );
});

// ------------------------------------------------------------
// URL builders
// ------------------------------------------------------------

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

test('getPrimaryUrl: preprint/doi_url/openreview each resolve alone', () => {
  assert.equal(getPrimaryUrl({ preprint: 'http://p' }), 'http://p');
  assert.equal(getPrimaryUrl({ doi_url: 'http://d' }), 'http://d');
  assert.equal(getPrimaryUrl({ openreview: 'http://o' }), 'http://o');
});

test('getPrimaryUrl: doi_url preferred over preprint (published paper w/ preprint link)', () => {
  assert.equal(
    getPrimaryUrl({ doi_url: 'http://doi', preprint: 'http://psyarxiv' }),
    'http://doi'
  );
});

test('getPrimaryUrl: arxiv preferred over preprint', () => {
  assert.equal(
    getPrimaryUrl({ arxiv: '1234.5678', preprint: 'http://p' }),
    'https://arxiv.org/abs/1234.5678'
  );
});

test('getPrimaryUrl: returns null if no known link', () => {
  assert.equal(getPrimaryUrl({ code: 'http://c' }), null);
  assert.equal(getPrimaryUrl({}), null);
});

test('labelForUrl: ACL Anthology', () => {
  assert.equal(labelForUrl('https://aclanthology.org/2021.emnlp-main.234'), 'ACL Anthology');
});
test('labelForUrl: arXiv', () => {
  assert.equal(labelForUrl('https://arxiv.org/abs/2501.12345'), 'arXiv');
  assert.equal(labelForUrl('http://arxiv.org/abs/x'), 'arXiv');
});
test('labelForUrl: OpenReview', () => {
  assert.equal(labelForUrl('https://openreview.net/forum?id=abc'), 'OpenReview');
});
test('labelForUrl: PsyArXiv via psyarxiv.com', () => {
  assert.equal(labelForUrl('https://psyarxiv.com/qjnpv'), 'PsyArXiv');
});
test('labelForUrl: PsyArXiv via doi.org/10.31234', () => {
  assert.equal(labelForUrl('https://doi.org/10.31234/osf.io/qjnpv'), 'PsyArXiv');
});
test('labelForUrl: generic doi.org → DOI', () => {
  assert.equal(labelForUrl('https://doi.org/10.1162/opmi_a_00086'), 'DOI');
});
test('labelForUrl: eScholarship falls through to default ("link")', () => {
  assert.equal(labelForUrl('https://escholarship.org/uc/item/9kr1b1gm'), 'link');
  assert.equal(labelForUrl('https://escholarship.mcgill.ca/concern/theses/r494vr42w'), 'link');
});
test('labelForUrl: OSF, bioRxiv', () => {
  assert.equal(labelForUrl('https://osf.io/2498w'), 'OSF');
  assert.equal(labelForUrl('https://www.biorxiv.org/content/xyz'), 'bioRxiv');
});

test('labelForUrl: underline.io and lingref fall through to default', () => {
  assert.equal(labelForUrl('https://underline.io/events/489/poster'), 'link');
  assert.equal(labelForUrl('http://www.lingref.com/cpp/wccfl/38/abstract3568.html'), 'link');
});
test('labelForUrl: .pdf extension → pdf', () => {
  assert.equal(labelForUrl('https://example.com/paper.pdf'), 'pdf');
  assert.equal(labelForUrl('https://hsp2025.github.io/abstracts/254.pdf'), 'pdf');
});
test('labelForUrl: unknown → "link" by default', () => {
  assert.equal(labelForUrl('https://example.com/'), 'link');
});
test('labelForUrl: custom fallback overrides "link"', () => {
  assert.equal(labelForUrl('https://example.com/', 'preprint'), 'preprint');
});
test('labelForUrl: null/undefined → null', () => {
  assert.equal(labelForUrl(null), null);
  assert.equal(labelForUrl(undefined), null);
});

test('labelForPrimary: DOI prefix wins over osf.io URL (PsyArXiv case)', () => {
  // Bib has URL=https://osf.io/2498w and DOI=10.31234/...
  // The primary URL is the osf.io URL, but we want the PsyArXiv label.
  const links = {
    url: 'https://osf.io/2498w',
    doi_url: 'https://doi.org/10.31234/osf.io/2498w_v1',
  };
  assert.equal(labelForPrimary(links, links.url), 'PsyArXiv');
});

test('labelForPrimary: DOI prefix wins for arXiv over a different URL', () => {
  const links = {
    url: 'https://example.com/preprint',
    doi_url: 'https://doi.org/10.48550/arXiv.2603.05432',
  };
  assert.equal(labelForPrimary(links, links.url), 'arXiv');
});

test('labelForPrimary: unrecognized DOI prefix falls through to URL label', () => {
  // 10.1162 is Open Mind (MIT Press) — not in our map, so the URL wins.
  const links = {
    url: 'https://doi.org/10.1162/opmi_a_00086',
    doi_url: 'https://doi.org/10.1162/opmi_a_00086',
  };
  // Primary URL happens to be a DOI URL, labelForUrl falls back to "DOI"
  assert.equal(labelForPrimary(links, links.url), 'DOI');
});

test('labelForPrimary: no DOI → URL-based label', () => {
  const links = { url: 'https://aclanthology.org/2021.emnlp-main.234' };
  assert.equal(labelForPrimary(links, links.url), 'ACL Anthology');
});

// ------------------------------------------------------------
// Sort + validate
// ------------------------------------------------------------

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

test('validateEntry: rejects co_first greater than authors.length', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, authors: ['A B'], co_first: 5 }),
    /co_first/
  );
});

test('validateEntry: rejects co_last greater than authors.length', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, authors: ['A B'], co_last: 3 }),
    /co_last/
  );
});

test('validateEntry: rejects non-integer co_first', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, authors: ['A B', 'C D'], co_first: 1.5 }),
    /co_first/
  );
});

test('validateEntry: accepts valid co_first and co_last', () => {
  assert.doesNotThrow(() =>
    validateEntry({
      ...minimalEntry,
      authors: ['A B', 'C D', 'E F'],
      co_first: 2,
      co_last: 1,
    })
  );
});

test('validateEntry: rejects links.other entry missing label or url', () => {
  assert.throws(
    () => validateEntry({ ...minimalEntry, links: { other: [{ label: 'x' }] } }),
    /links\.other/
  );
});

// ------------------------------------------------------------
// HTML entry rendering
// ------------------------------------------------------------

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

test('generateHtmlEntry: co_first marks first N authors with superscript ∗', () => {
  const e = { ...htmlFixture, co_first: 2 };
  const html = generateHtmlEntry(e);
  assert.match(html, /Jacob Louis Hoover<sup[^>]*>∗<\/sup>, Wenyu Du<sup[^>]*>∗<\/sup>/);
});

test('generateHtmlEntry: co_last marks last M authors with superscript ‡', () => {
  const e = { ...htmlFixture, co_last: 2 };
  const html = generateHtmlEntry(e);
  assert.match(
    html,
    /Alessandro Sordoni<sup[^>]*>‡<\/sup>, Timothy J\. O&#39;Donnell<sup[^>]*>‡<\/sup>/
  );
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

test('generateHtmlEntry: escapes HTML-unsafe chars in title', () => {
  const entry = { ...htmlFixture, title: 'p < 0.05 & q > 0' };
  const html = generateHtmlEntry(entry);
  assert.match(html, /p &lt; 0\.05 &amp; q &gt; 0/);
  assert.doesNotMatch(html, /p < 0\.05/);
});

test('generateHtmlEntry: escapes HTML-unsafe chars in venue', () => {
  const entry = { ...htmlFixture, venue: 'A & B Conference', venue_url: undefined };
  const html = generateHtmlEntry(entry);
  assert.match(html, /A &amp; B Conference/);
});

test('generateHtmlEntry: escapes HTML-unsafe chars in author names', () => {
  const entry = { ...htmlFixture, authors: ['Alice & Co'] };
  const html = generateHtmlEntry(entry);
  assert.match(html, /Alice &amp; Co/);
});

test('generateHtmlEntry: primary-URL button goes first, labeled by domain', () => {
  const e = {
    ...htmlFixture,
    links: { url: 'https://aclanthology.org/2021.emnlp-main.234', code: 'https://github.com/x' },
  };
  const html = generateHtmlEntry(e);
  // Primary button present, labeled 'ACL Anthology', appears before code
  assert.match(
    html,
    /<a class="extra link"[^>]*>ACL Anthology<\/a>[\s\S]*<a class="extra code"/
  );
});

test('generateHtmlEntry: skips primary button when arxiv already shows same URL (http/https dedup)', () => {
  const e = {
    ...htmlFixture,
    links: { url: 'http://arxiv.org/abs/2603.05432', arxiv: '2603.05432' },
  };
  const html = generateHtmlEntry(e);
  assert.doesNotMatch(html, /class="extra link"/);
  assert.equal((html.match(/class="extra arxiv"/g) || []).length, 1);
});

test('generateHtmlEntry: skips primary button when openreview already shows same URL', () => {
  const e = {
    ...htmlFixture,
    links: {
      url: 'https://openreview.net/forum?id=abc',
      openreview: 'https://openreview.net/forum?id=abc',
    },
  };
  const html = generateHtmlEntry(e);
  assert.doesNotMatch(html, /class="extra link"/);
  assert.equal((html.match(/class="extra openreview"/g) || []).length, 1);
});

test('generateHtmlEntry: preprint button uses domain-aware label for PsyArXiv', () => {
  const e = {
    ...htmlFixture,
    links: {
      url: 'https://example.com/published-version',
      preprint: 'https://doi.org/10.31234/osf.io/qjnpv',
    },
  };
  const html = generateHtmlEntry(e);
  assert.match(
    html,
    /<a class="extra preprint" href="https:\/\/doi\.org\/10\.31234\/[^"]+">PsyArXiv<\/a>/
  );
});

test('generateHtmlEntry: preprint button falls back to "preprint" for unknown domain', () => {
  const e = {
    ...htmlFixture,
    links: {
      url: 'https://example.com/x',
      preprint: 'https://random-preprint-server.example.com/p',
    },
  };
  const html = generateHtmlEntry(e);
  assert.match(html, /<a class="extra preprint"[^>]*>preprint<\/a>/);
});

test('generateHtmlEntry: DOI primary yields [DOI] button when no prefix match', () => {
  const e = {
    ...htmlFixture,
    links: { doi_url: 'https://doi.org/10.1162/opmi_a_00086' },
  };
  const html = generateHtmlEntry(e);
  assert.match(html, /<a class="extra link" href="https:\/\/doi\.org\/[^"]+">DOI<\/a>/);
});

test('generateHtmlEntry: link_label overrides the auto-derived label', () => {
  const e = {
    ...htmlFixture,
    link_label: 'Open Mind',
    links: { doi_url: 'https://doi.org/10.1162/opmi_a_00086' },
  };
  const html = generateHtmlEntry(e);
  assert.match(
    html,
    /<a class="extra link" href="https:\/\/doi\.org\/[^"]+">Open Mind<\/a>/
  );
  assert.doesNotMatch(html, />DOI</);
});

test('generateHtmlEntry: OSF URL labeled PsyArXiv when DOI prefix is 10.31234', () => {
  const e = {
    ...htmlFixture,
    links: {
      url: 'https://osf.io/2498w',
      doi_url: 'https://doi.org/10.31234/osf.io/2498w_v1',
    },
  };
  const html = generateHtmlEntry(e);
  assert.match(
    html,
    /<a class="extra link" href="https:\/\/osf\.io\/2498w">PsyArXiv<\/a>/
  );
});

test('adaptEntry: copies extras.link_label onto entry', () => {
  const e = adaptEntry(cslInproceedings, { link_label: 'Proceedings' });
  assert.equal(e.link_label, 'Proceedings');
});

// ------------------------------------------------------------
// Pub-list partial
// ------------------------------------------------------------

const docEntries = [
  {
    id: 'a', title: 'A', authors: ['X Y'], year: 2023, type: 'article',
    venue: 'V', links: { url: 'http://a' },
  },
  {
    id: 'b', title: 'B', authors: ['P Q', 'R S'], year: 2022, type: 'misc',
    venue: 'W', co_first: 2,
  },
];

test('generatePubList: wraps items in a pandoc raw-html pub-list block', () => {
  const md = generatePubList(docEntries);
  assert.match(md, /^```\{=html\}$/m);
  assert.match(md, /<ul class="pub-list">/);
  assert.match(md, /<li class="pub">/);
  assert.match(md, /<\/ul>\n```/);
});

test('generatePubList: co-first footnote only when co_first > 0 on some entry', () => {
  const md = generatePubList(docEntries);
  assert.match(md, /<sup[^>]*>∗<\/sup> Co-first authorship/);
  const mdNoCF = generatePubList([docEntries[0]]);
  assert.doesNotMatch(mdNoCF, /Co-first authorship/);
});

test('generatePubList: co-senior footnote only when co_last > 0 on some entry', () => {
  const noCL = generatePubList(docEntries);
  assert.doesNotMatch(noCL, /Co-senior authorship/);
  const withCL = generatePubList([
    { ...docEntries[0], authors: ['A', 'B', 'C'], co_last: 2 },
  ]);
  assert.match(withCL, /<sup[^>]*>‡<\/sup> Co-senior authorship/);
});

// ------------------------------------------------------------
// Bib source loading
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// citation-js parsing + bib-text helpers
// ------------------------------------------------------------

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

test('extractEntriesByKey: preserves raw entries with original cite keys', () => {
  const result = extractEntriesByKey(SAMPLE_BIB, ['foo:2021conf', 'bar:2023journal']);
  assert.match(result, /^@inproceedings\{foo:2021conf/m);
  assert.match(result, /^@article\{bar:2023journal/m);
  assert.doesNotMatch(result, /baz:2024phd/);
  assert.doesNotMatch(result, /qux:2025arxiv/);
});

test('extractEntriesByKey: preserves the order of requested keys as encountered in bib', () => {
  const result = extractEntriesByKey(SAMPLE_BIB, ['bar:2023journal', 'foo:2021conf']);
  const fooIdx = result.indexOf('foo:2021conf');
  const barIdx = result.indexOf('bar:2023journal');
  assert.ok(fooIdx < barIdx, 'entries should appear in source-bib order, not requested order');
});

test('extractEntriesByKey: empty requested set yields empty output', () => {
  assert.equal(extractEntriesByKey(SAMPLE_BIB, []).trim(), '');
});

test('extractEntriesByKey: unknown keys are silently skipped', () => {
  const result = extractEntriesByKey(SAMPLE_BIB, ['foo:2021conf', 'nonexistent:2099']);
  assert.match(result, /foo:2021conf/);
  assert.doesNotMatch(result, /nonexistent/);
});

test('stripLeakyFields: removes file field with local paths', () => {
  const input = `@article{x,
  title = {T},
  file = {/Users/v/Zotero/file.pdf;/Users/v/other/file2.pdf},
  author = {A B},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  assert.doesNotMatch(result, /\/Users\/v/);
  assert.doesNotMatch(result, /\bfile\s*=/);
  assert.match(result, /title = \{T\}/);
  assert.match(result, /author = \{A B\}/);
});

test('stripLeakyFields: handles nested braces in abstract', () => {
  const input = `@article{x,
  title = {T},
  abstract = {Some {nested} braces and $math_{sub}$ here.},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  assert.doesNotMatch(result, /abstract/);
  assert.doesNotMatch(result, /nested/);
  assert.match(result, /title = \{T\}/);
  assert.match(result, /year = \{2025\}/);
});

test('stripLeakyFields: handles multiline field values', () => {
  const input = `@article{x,
  title = {T},
  abstract = {First line of abstract.
    Second line here.
    Third line concludes.},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  assert.doesNotMatch(result, /abstract/);
  assert.doesNotMatch(result, /Second line/);
  assert.match(result, /title = \{T\}/);
});

test('stripLeakyFields: removes all designated leaky fields', () => {
  const input = `@article{x,
  title = {T},
  keywords = {tag1,tag2},
  urldate = {2024-11-15},
  langid = {en-US},
  pubstate = {prepublished},
  eprintclass = {cs.CL},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  for (const field of ['keywords', 'urldate', 'langid', 'pubstate', 'eprintclass']) {
    assert.doesNotMatch(result, new RegExp(`\\b${field}\\b`), `${field} should be stripped`);
  }
  assert.match(result, /title = \{T\}/);
  assert.match(result, /year = \{2025\}/);
});

test('stripLeakyFields: leaves non-leaky fields intact', () => {
  const input = `@article{x,
  title = {T},
  author = {A B},
  doi = {10.1000/xyz},
  url = {https://example.com},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  assert.match(result, /title = \{T\}/);
  assert.match(result, /author = \{A B\}/);
  assert.match(result, /doi = \{10\.1000\/xyz\}/);
  assert.match(result, /url = \{https:\/\/example\.com\}/);
  assert.match(result, /year = \{2025\}/);
});

test('stripLeakyFields: does not munge entry header', () => {
  const input = `@article{x,
  file = {/path},
  year = {2025}
}`;
  const result = stripLeakyFields(input);
  assert.match(result, /^@article\{x,/);
});

// ------------------------------------------------------------
// CSL-JSON type + author adapters
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// adaptEntry
// ------------------------------------------------------------

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
  assert.equal(e.venue, 'FCoT');
  assert.equal(e.pages, '1-10');
  assert.equal(e.publisher, 'Some Publisher');
  assert.equal(e.address, 'Somewhere');
  assert.equal(e.doi, '10.1000/abc');
  assert.equal(e.links.url, 'https://example.com/abc');
  assert.equal(e.links.doi_url, 'https://doi.org/10.1000/abc');
});

test('adaptEntry: venue fallback chain', () => {
  const e1 = adaptEntry(cslInproceedings, { venue: 'Short Label' });
  assert.equal(e1.venue, 'Short Label');
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
  assert.equal(e.publisher, undefined);
  assert.equal(e.links.url, 'https://example.com/thesis');
});

test('adaptEntry: extras note + status + co_first + co_last', () => {
  const e = adaptEntry(cslInproceedings, {
    note: 'Best Paper',
    status: 'preprint',
    co_first: 2,
    co_last: 1,
  });
  assert.equal(e.note, 'Best Paper');
  assert.equal(e.status, 'preprint');
  assert.equal(e.co_first, 2);
  assert.equal(e.co_last, 1);
});

test('adaptEntry: links merge — extras add to bib-derived', () => {
  const e = adaptEntry(cslInproceedings, {
    links: {
      code: 'https://github.com/foo',
      slides: 'talk.pdf',
    },
  });
  assert.equal(e.links.url, 'https://example.com/abc');
  assert.equal(e.links.doi_url, 'https://doi.org/10.1000/abc');
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

test('adaptEntry: venue defaults to "arXiv" for arxiv entries with no other venue info', () => {
  const cslArxiv = {
    id: 'chan:2026',
    type: 'webpage',
    title: 'Paper',
    author: [{ given: 'A', family: 'B' }],
    issued: { 'date-parts': [[2026]] },
  };
  const arxivMap = new Map([['chan:2026', '2603.05432']]);
  const e = adaptEntry(cslArxiv, {}, arxivMap);
  assert.equal(e.venue, 'arXiv');
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
