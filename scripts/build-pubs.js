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
