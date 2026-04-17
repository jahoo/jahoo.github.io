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
