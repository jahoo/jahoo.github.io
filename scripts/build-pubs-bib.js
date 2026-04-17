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
