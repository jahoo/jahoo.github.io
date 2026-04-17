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
    // misc / online — howpublished uses the venue_full label if distinct from URL.
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

const GOOGLE_SCHOLAR_URL =
  'https://scholar.google.com/citations?user=tfaTOlEAAAAJ';

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

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
