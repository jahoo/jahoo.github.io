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
