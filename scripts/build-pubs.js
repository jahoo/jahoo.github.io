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
