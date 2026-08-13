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

// Pandoc tolerates trailing horizontal whitespace after the `---` delimiter
// (e.g. a straggling space or tab left by an editor); both patterns below
// must too, or we'd be stricter than the tool we feed and risk throwing —
// or worse, silently leaving an unterminated block's YAML in the body.
const DELIM = /^---[ \t]*\r?\n/;

/**
 * Locate a leading YAML front-matter block's raw YAML text and raw body
 * text. Returns null when there is no opening delimiter, or the block is
 * unterminated — the two cases where extractFrontMatter must yield null
 * and stripFrontMatter must return the input unchanged.
 */
function findFrontMatterBounds(text) {
  if (!DELIM.test(text)) return null;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/^---[ \t]*\r?$/m);
  if (end === -1) return null;
  const afterDelim = rest.indexOf('\n', end);
  return {
    yaml: rest.slice(0, end),
    body: afterDelim === -1 ? '' : rest.slice(afterDelim + 1),
  };
}

/** Return the YAML block's inner text, or null when there is no block. */
function extractFrontMatter(text) {
  const bounds = findFrontMatterBounds(text);
  if (bounds === null) return null;
  // Normalise line endings within the YAML block itself, so the restored
  // front matter is internally consistent even when the source .qmd is
  // CRLF. The body (below) is left exactly as Quarto produced it.
  return bounds.yaml.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

/** Return the document body with any leading YAML block removed. */
function stripFrontMatter(text) {
  const bounds = findFrontMatterBounds(text);
  if (bounds === null) return text;
  // Drop only the blank line(s) separating the YAML block from the body —
  // not all leading whitespace. A body that opens with an indented code
  // block must keep that indentation on its first line.
  return bounds.body.replace(/^(?:[ \t]*\r?\n)+/, '');
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
