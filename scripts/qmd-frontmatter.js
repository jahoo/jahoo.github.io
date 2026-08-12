#!/usr/bin/env node
// scripts/qmd-frontmatter.js
//
// Quarto rewrites front matter when it renders: it consumes `css:`, `toc:` and
// `bibliography:` as format options (so they vanish from the emitted YAML) and
// adds a duplicate `authors:` plus a stray `toc-title:`. The site build reads
// `toc:` and `css:` straight out of the generated markdown, so we put the
// source .qmd's YAML back verbatim and keep only Quarto's body.
//
// Usage: node scripts/qmd-frontmatter.js <generated.md> <source.qmd>  > out.md

import { readFileSync } from 'node:fs';

const DELIM = /^---\r?\n/;

/** Return the YAML block's inner text, or null when there is no block. */
function extractFrontMatter(text) {
  if (!DELIM.test(text)) return null;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/^---\r?$/m);
  if (end === -1) return null;
  return rest.slice(0, end).replace(/\s+$/, '');
}

/** Return the document body with any leading YAML block removed. */
function stripFrontMatter(text) {
  if (!DELIM.test(text)) return text;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/^---\r?$/m);
  if (end === -1) return text;
  const afterDelim = rest.indexOf('\n', end);
  return afterDelim === -1 ? '' : rest.slice(afterDelim + 1).replace(/^\s+/, '');
}

export function swapFrontMatter(generatedMd, qmdSource) {
  const yaml = extractFrontMatter(qmdSource);
  if (yaml === null) {
    throw new Error('source .qmd has no YAML front matter');
  }
  const marker = [
    '# GENERATED FILE — DO NOT EDIT.',
    '# Source of truth is the sibling .qmd; regenerate with `make notebooks`.',
  ].join('\n');
  return `---\n${marker}\n${yaml}\n---\n\n${stripFrontMatter(generatedMd)}`;
}

// CLI entry point: only runs when invoked directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [, , generatedPath, qmdPath] = process.argv;
  if (!generatedPath || !qmdPath) {
    console.error('usage: qmd-frontmatter.js <generated.md> <source.qmd>');
    process.exit(1);
  }
  process.stdout.write(
    swapFrontMatter(
      readFileSync(generatedPath, 'utf8'),
      readFileSync(qmdPath, 'utf8')
    )
  );
}
