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

// citation-js silently drops biblatex's eprint/eprinttype/archiveprefix fields
// when mapping to CSL-JSON. For arxiv preprints we recover the ID by scanning
// the raw bib text. Returns Map<citeKey, eprintId>.
const ENTRY_RE = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;

function getBibField(body, fieldName) {
  const re = new RegExp(
    `\\b${fieldName}\\s*=\\s*(?:\\{([^{}]*)\\}|"([^"]*)")`,
    'i'
  );
  const m = body.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

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

// Map CSL-JSON type strings (what citation-js emits) to our entry type enum.
// Observed in Task 1 smoke-test against a biblatex fixture:
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

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

function main() {
  console.log('build-pubs-bib: not yet implemented');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
