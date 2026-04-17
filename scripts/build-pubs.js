#!/usr/bin/env node
// scripts/build-pubs.js
//
// Builds the publications page at /pubs/ from:
//   - source.bib (symlink to the user's global biblatex file — the canonical
//     source of bibliographic data)
//   - pubs.yaml (a short list of bib keys with website-specific extras:
//     short venue labels, custom link buttons, awards, status tags,
//     equal-contribution marks)
//
// Emits:
//   - _generated/pubs.md            (Pandoc markdown; compiled into /pubs/)
//   - assets/bibliography/pubs.bib  (filter of source.bib — verbatim entries
//                                    for the keys listed in pubs.yaml, with
//                                    Zotero's local-path `file` field and
//                                    other private metadata stripped)
//
// All pure helpers are exported for unit testing.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';

// ------------------------------------------------------------
// Rendering helpers (pure; exported for testing)
// ------------------------------------------------------------

export function stripTitleBraces(title) {
  return title.replace(/[{}]/g, '');
}

// Escape the five HTML-unsafe characters for safe insertion into element
// content and attribute values. Leaves nullish values unchanged so callers
// can use it on optional fields without guards.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  if (s == null) return s;
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function formatAuthorsHtml(authors, equalContribution = []) {
  const marked = authors.map((a, i) =>
    equalContribution.includes(i) ? `${a}*` : a
  );
  return marked.join(', ');
}

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

// Map URL → display label for link buttons. Common publisher / preprint-server
// domains get a short name; DOI URLs use the DOI prefix to identify the
// publisher when known; everything else falls back to the caller's default
// (usually "link" for a primary-URL button, "preprint" for links.preprint).
const DOI_PREFIX_LABELS = {
  '10.31234': 'PsyArXiv',
  '10.48550': 'arXiv',
};

const URL_LABEL_RULES = [
  [/^https?:\/\/(www\.)?arxiv\.org\//i, 'arXiv'],
  [/^https?:\/\/(www\.)?aclanthology\.org\//i, 'ACL Anthology'],
  [/^https?:\/\/(www\.)?openreview\.net\//i, 'OpenReview'],
  [/^https?:\/\/(www\.)?psyarxiv\.com\//i, 'PsyArXiv'],
  [/^https?:\/\/(www\.)?biorxiv\.org\//i, 'bioRxiv'],
  [/^https?:\/\/(www\.)?osf\.io\//i, 'OSF'],
];

export function labelForUrl(url, fallback = 'link') {
  if (!url) return null;
  const doiMatch = url.match(/^https?:\/\/doi\.org\/(10\.\d+)/i);
  if (doiMatch) {
    return DOI_PREFIX_LABELS[doiMatch[1]] ?? 'DOI';
  }
  for (const [re, label] of URL_LABEL_RULES) {
    if (re.test(url)) return label;
  }
  if (/\.pdf(?:[?#].*)?$/i.test(url)) return 'pdf';
  return fallback;
}

// Fallback order: a paper's DOI (when present) is the canonical published URL
// and should beat any preprint link. arxiv/openreview/preprint are used only
// when no DOI is set (typical for preprint-only or review-venue entries).
export function getPrimaryUrl(links) {
  if (!links) return null;
  if (links.url) return links.url;
  if (links.doi_url) return links.doi_url;
  if (links.arxiv) return buildArxivUrl(links.arxiv);
  if (links.openreview) return links.openreview;
  if (links.preprint) return links.preprint;
  return null;
}

// Coerce month value to integer for sorting.
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

// Order of link buttons in the .pub-extras row.
// `preprint` uses labelForUrl so a PsyArXiv/bioRxiv DOI gets [PsyArXiv]/
// [bioRxiv] instead of the generic "preprint".
const LINK_RENDERERS = [
  ['arxiv',      (v) => ({ cls: 'arxiv',      label: 'arXiv',                        href: buildArxivUrl(v) })],
  ['preprint',   (v) => ({ cls: 'preprint',   label: labelForUrl(v, 'preprint'),     href: v })],
  ['pdf',        (v) => ({ cls: 'pdf',        label: 'pdf',                          href: buildPdfUrl(v) })],
  ['code',       (v) => ({ cls: 'code',       label: 'code',                         href: v })],
  ['slides',     (v) => ({ cls: 'slides',     label: 'slides',                       href: buildPdfUrl(v) })],
  ['poster',     (v) => ({ cls: 'poster',     label: 'poster',                       href: buildPdfUrl(v) })],
  ['handout',    (v) => ({ cls: 'handout',    label: 'handout',                      href: buildPdfUrl(v) })],
  ['video',      (v) => ({ cls: 'video',      label: 'video',                        href: v })],
  ['openreview', (v) => ({ cls: 'openreview', label: 'OpenReview',                   href: v })],
  ['lingbuzz',   (v) => ({ cls: 'lingbuzz',   label: 'lingbuzz',                     href: buildLingbuzzUrl(v) })],
];

// Normalize URLs for comparison — strips scheme, trailing slash, and fragment.
// Lets us treat `http://arxiv.org/abs/X` and `https://arxiv.org/abs/X/` as
// the same URL for dedup purposes.
function normalizeUrl(url) {
  return String(url)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/#.*$/, '');
}

function renderExtras(links, bibHtml, linkLabelOverride) {
  const buttons = [];
  if (links) {
    const regular = [];
    const hrefs = new Set();
    for (const [key, fn] of LINK_RENDERERS) {
      if (links[key]) {
        const { cls, label, href } = fn(links[key]);
        regular.push(`<a class="extra ${cls}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
        hrefs.add(normalizeUrl(href));
      }
    }
    const others = (links.other ?? []).map((o) => {
      hrefs.add(normalizeUrl(o.url));
      return `<a class="extra other" href="${escapeHtml(o.url)}">${escapeHtml(o.label)}</a>`;
    });

    // Primary-URL button, labeled by domain (or by an explicit link_label
    // override from the entry) — goes first in the row. Skipped if another
    // button already shows the same URL.
    const primaryUrl = getPrimaryUrl(links);
    if (primaryUrl && !hrefs.has(normalizeUrl(primaryUrl))) {
      const label = linkLabelOverride ?? labelForUrl(primaryUrl);
      buttons.push(
        `<a class="extra link" href="${escapeHtml(primaryUrl)}">${escapeHtml(label)}</a>`
      );
    }
    buttons.push(...regular, ...others);
  }
  if (bibHtml) {
    // <details> is rendered inline (see site.css) so the [bib] summary shares
    // the extras line with the other link buttons. When the user clicks it,
    // the sourceCode block inside breaks to a new line below while the
    // summary itself stays in place.
    buttons.push(
      `<details class="pub-bibtex"><summary class="extra bib">bib</summary>\n` +
      `${bibHtml}    </details>`
    );
  }
  if (buttons.length === 0) return '';
  return `  <div class="pub-extras">\n    ${buttons.join('\n    ')}\n  </div>\n`;
}

export function generateHtmlEntry(paper) {
  const title = escapeHtml(stripTitleBraces(paper.title));
  const authors = escapeHtml(
    formatAuthorsHtml(paper.authors, paper.equal_contribution ?? [])
  );
  const primaryUrl = getPrimaryUrl(paper.links);

  const titleHtml = primaryUrl
    ? `<a class="pub-title" href="${escapeHtml(primaryUrl)}">${title}</a>`
    : `<span class="pub-title">${title}</span>`;

  const venue = escapeHtml(paper.venue);
  const venueHtml = paper.venue_url
    ? `<a class="pub-venue" href="${escapeHtml(paper.venue_url)}">${venue}</a>`
    : `<span class="pub-venue">${venue}</span>`;

  const noteHtml = paper.note
    ? ` <span class="pub-note">(${escapeHtml(paper.note)})</span>`
    : '';
  const statusHtml = paper.status
    ? ` <span class="pub-status">${escapeHtml(paper.status)}</span>`
    : '';

  return [
    '<li class="pub">',
    `  ${titleHtml}`,
    `  <span class="pub-author">${authors}</span>`,
    `  ${venueHtml}${statusHtml}${noteHtml}`,
    renderExtras(paper.links, paper.bibHtml, paper.link_label),
    '</li>',
  ].join('\n');
}

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

// ------------------------------------------------------------
// Bib-source helpers (pure; exported for testing)
// ------------------------------------------------------------

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

export function parseBib(text) {
  return new Cite(text).data;
}

export function indexByKey(entries) {
  return new Map(entries.map((e) => [e.id, e]));
}

// Regex for a single biblatex entry. Non-greedy, close on \n\s*\}.
const ENTRY_RE = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;

function getBibField(body, fieldName) {
  const re = new RegExp(
    `\\b${fieldName}\\s*=\\s*(?:\\{([^{}]*)\\}|"([^"]*)")`,
    'i'
  );
  const m = body.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

// citation-js silently drops biblatex's eprint/eprinttype/archiveprefix fields
// when mapping to CSL-JSON. For arxiv preprints we recover the ID by scanning
// the raw bib text. Returns Map<citeKey, eprintId>.
export function extractArxivEprints(bibText) {
  const map = new Map();
  const re = new RegExp(ENTRY_RE.source, 'g');
  let m;
  while ((m = re.exec(bibText)) !== null) {
    const key = m[2];
    const body = m[3];
    const eprint = getBibField(body, 'eprint');
    if (!eprint) continue;
    const eprinttype = getBibField(body, 'eprinttype');
    const archiveprefix = getBibField(body, 'archiveprefix');
    const isArxiv =
      (eprinttype && /arxiv/i.test(eprinttype)) ||
      (archiveprefix && /arxiv/i.test(archiveprefix));
    if (isArxiv) {
      map.set(key, eprint);
    }
  }
  return map;
}

// Extract raw biblatex entries verbatim (preserving original cite keys and
// formatting) for the given set of keys. Used to emit the downloadable
// pubs.bib — citation-js's serializer rewrites cite keys, which we don't
// want for this download.
export function extractEntriesByKey(bibText, keys) {
  const wanted = new Set(keys);
  const pieces = [];
  const re = new RegExp(ENTRY_RE.source, 'g');
  let m;
  while ((m = re.exec(bibText)) !== null) {
    if (wanted.has(m[2])) {
      pieces.push(m[0]);
    }
  }
  return pieces.length === 0 ? '' : pieces.join('\n\n') + '\n';
}

// Fields stripped from entries before writing the downloadable bib.
// - `file`: Zotero writes absolute local paths — would leak private filesystem layout.
// - `abstract`, `keywords`, `urldate`, `langid`, `pubstate`, `eprintclass`: internal
//   Zotero metadata not useful for readers who want to cite the work.
const LEAKY_BIB_FIELDS = new Set([
  'file', 'abstract', 'keywords', 'urldate', 'langid', 'pubstate', 'eprintclass',
]);

// Remove leaky fields from biblatex text, handling brace-balanced multi-line
// field values (needed for abstracts with nested braces or long paragraphs).
//
// The field-start regex uses [ \t]* (same-line indent only), NOT \s* — otherwise
// greedy \s* would swallow the preceding newline as "leading whitespace," and
// stripping would collapse the previous line's terminator against the next
// surviving field's indent.
export function stripLeakyFields(bibText) {
  const out = [];
  let i = 0;
  const FIELD_START_RE = /^([ \t]*)(\w+)[ \t]*=[ \t]*\{/;
  while (i < bibText.length) {
    const rest = bibText.slice(i);
    const m = rest.match(FIELD_START_RE);
    if (m && LEAKY_BIB_FIELDS.has(m[2].toLowerCase())) {
      // Walk brace-balanced to find the end of this field value.
      const valStart = i + m[0].length;
      let depth = 1;
      let j = valStart;
      while (j < bibText.length && depth > 0) {
        const c = bibText[j];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      // Skip trailing comma and following whitespace through newline.
      let endPos = j;
      if (bibText[endPos] === ',') endPos++;
      while (endPos < bibText.length && /[^\S\n]/.test(bibText[endPos])) endPos++;
      if (bibText[endPos] === '\n') endPos++;
      i = endPos;
    } else {
      out.push(bibText[i]);
      i++;
    }
  }
  return out.join('');
}

// Map CSL-JSON type strings (what citation-js emits) to our entry type enum.
// Observed mappings:
//   @inproceedings → paper-conference
//   @article       → article-journal
//   @thesis        → thesis
//   @online        → webpage     (biblatex preprints come through here)
//   @misc          → document
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

// Convert CSL-JSON's structured author objects (one of {given, family,
// non-dropping-particle, dropping-particle, suffix} or {literal}) to
// "First Last" strings matching the input format of formatAuthorsHtml.
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

// Build our entry shape (what generateHtmlEntry consumes) by pulling
// bibliographic data from the CSL-JSON entry and overlaying the extras.
//
// arxivEprints is a Map<key, eprintId> produced by extractArxivEprints;
// citation-js drops biblatex's eprint/eprinttype fields, so we pass this
// in as a third argument and use it to populate links.arxiv.
export function adaptEntry(csl, extras = {}, arxivEprints = new Map()) {
  const { year, month, day } = extractDate(csl.issued);
  const type = mapCslType(csl.type);

  const containerTitle =
    csl['container-title'] || csl.journal || csl.booktitle || undefined;
  const eventTitle = csl['event-title'] || csl['event'] || undefined;

  // Links: bib-derived fill in first, extras override
  const bibUrl = csl.URL || undefined;
  const doiUrl = csl.DOI ? `https://doi.org/${csl.DOI}` : undefined;
  const arxivId = arxivEprints.get(csl.id) || undefined;

  // venue: extras override; else short forms; else event-title;
  // else container-title; else (for theses) publisher;
  // else (for arxiv preprints without other venue info) "arXiv"
  const venue =
    extras.venue ??
    csl['container-title-short'] ??
    eventTitle ??
    containerTitle ??
    (type === 'thesis' ? csl.publisher : undefined) ??
    (arxivId ? 'arXiv' : undefined);

  // venue_full — for theses, the publisher is the school (our venue_full)
  const venueFull = containerTitle ?? (type === 'thesis' ? csl.publisher : undefined);

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
  if (venueFull) entry.venue_full = venueFull;
  if (extras.venue_url) entry.venue_url = extras.venue_url;
  if (csl.page) entry.pages = csl.page;
  // For thesis: CSL stores school in publisher; keep it as venue_full only,
  // don't duplicate as entry.publisher.
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
  if (extras.link_label) entry.link_label = extras.link_label;

  if (Object.keys(links).length > 0) entry.links = links;

  return entry;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

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

// Batch-highlight all bib entries in a single Pandoc invocation.
// Returns an array of HTML strings (one <div class="sourceCode">...</div> each)
// in the same order as the input. Line-number anchors and numbered ids from
// Pandoc are stripped to avoid visual clutter and id collisions on the page.
function highlightBibsBatch(bibStrings) {
  if (bibStrings.length === 0) return [];
  const markdown = bibStrings
    .map((s) => '```bibtex\n' + s + '\n```')
    .join('\n\n');
  const result = spawnSync(
    'pandoc',
    ['--from', 'markdown', '--to', 'html', '--wrap=none'],
    { input: markdown, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      'Pandoc highlighting failed:\n' + (result.stderr || '(no stderr)')
    );
  }
  const pieces = result.stdout
    .split(/(?=<div class="sourceCode")/)
    .filter((p) => p.trim().startsWith('<div class="sourceCode"'));
  if (pieces.length !== bibStrings.length) {
    throw new Error(
      `highlightBibsBatch: expected ${bibStrings.length} highlighted blocks, got ${pieces.length}`
    );
  }
  return pieces.map((p) =>
    p
      .replace(/\sid="cb[^"]*"/g, '')
      .replace(/<a href="#cb[^"]*"[^>]*><\/a>/g, '')
  );
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
  const arxivMap = extractArxivEprints(bibText);

  // 3. Read pubs.yaml.
  if (!existsSync('pubs.yaml')) {
    console.error('pubs.yaml not found at repo root');
    process.exit(1);
  }
  const overlays = yaml.load(readFileSync('pubs.yaml', 'utf8'));
  if (!Array.isArray(overlays)) {
    console.error('pubs.yaml must be a list of {key, ...extras} objects');
    process.exit(1);
  }

  // 4. For each requested key: find in bib, adapt, validate.
  const entries = [];
  const missing = [];
  for (const overlay of overlays) {
    const { key, ...extras } = overlay;
    if (!key) {
      console.error(`pubs.yaml entry missing required 'key': ${JSON.stringify(overlay)}`);
      process.exit(1);
    }
    const csl = index.get(key);
    if (!csl) {
      missing.push(key);
      continue;
    }
    entries.push(adaptEntry(csl, extras, arxivMap));
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
  warnMissingPdfs(entries);

  // 5. Sort entries.
  const sorted = sortEntries(entries);

  // 6. Extract each entry's bib verbatim (stripping private/leaky fields),
  // then syntax-highlight them all in a single Pandoc call. Attach the
  // resulting HTML to each entry for the <details> block in the page.
  const perEntryBib = sorted.map((e) =>
    stripLeakyFields(extractEntriesByKey(bibText, [e.id])).trim()
  );
  const highlighted = highlightBibsBatch(perEntryBib);
  sorted.forEach((e, i) => {
    e.bibHtml = highlighted[i];
  });

  // 7. Render the page.
  ensureDir('_generated');
  writeFileSync('_generated/pubs.md', generateMarkdown(sorted));
  console.log(`Generated: _generated/pubs.md (${sorted.length} entries)`);

  // 8. Write the filtered bib download.
  const biblatex = stripLeakyFields(
    extractEntriesByKey(bibText, sorted.map((e) => e.id))
  );
  ensureDir('assets/bibliography');
  writeFileSync('assets/bibliography/pubs.bib', biblatex);
  console.log(`Generated: assets/bibliography/pubs.bib (${sorted.length} entries)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
