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

// Extract raw biblatex entries verbatim (preserving original cite keys and
// formatting) for the given set of keys. Used to emit the downloadable
// pubs-bib.bib — citation-js's serializer rewrites cite keys, which we
// don't want for this download.
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

  if (Object.keys(links).length > 0) entry.links = links;

  return entry;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
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

  // 3. Read pubs-bib.yaml.
  if (!existsSync('pubs-bib.yaml')) {
    console.error('pubs-bib.yaml not found at repo root');
    process.exit(1);
  }
  const overlays = yaml.load(readFileSync('pubs-bib.yaml', 'utf8'));
  if (!Array.isArray(overlays)) {
    console.error('pubs-bib.yaml must be a list of {key, ...extras} objects');
    process.exit(1);
  }

  // 4. For each requested key: find in bib, adapt, validate.
  const entries = [];
  const missing = [];
  for (const overlay of overlays) {
    const { key, ...extras } = overlay;
    if (!key) {
      console.error(`pubs-bib.yaml entry missing required 'key': ${JSON.stringify(overlay)}`);
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

  // 5. Sort + render markdown.
  const sorted = sortEntries(entries);
  ensureDir('_generated');
  writeFileSync(
    '_generated/pubs-bib.md',
    generateMarkdown(sorted, { bibHref: '/assets/bibliography/pubs-bib.bib' })
  );
  console.log(`Generated: _generated/pubs-bib.md (${sorted.length} entries)`);

  // 6. Extract requested entries verbatim from the source bib for download.
  // Preserves original cite keys and field formatting (citation-js's own
  // serializer rewrites keys, which we don't want here).
  const selectedKeys = sorted.map(e => e.id);
  const biblatex = extractEntriesByKey(bibText, selectedKeys);
  ensureDir('assets/bibliography');
  writeFileSync('assets/bibliography/pubs-bib.bib', biblatex);
  console.log(`Generated: assets/bibliography/pubs-bib.bib (${sorted.length} entries)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
