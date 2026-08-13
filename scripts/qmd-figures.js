#!/usr/bin/env node
// scripts/qmd-figures.js
//
// Reconciles Quarto's native figure output with the site's conventions, so a
// .qmd source can stay idiomatic Quarto — `#| label:` and `#| fig-cap:`, no
// savefig, no hand-written image lines — and still run standalone if a reader
// downloads it.
//
// Three transforms on Quarto's pre-pandoc intermediate:
//
//   1. Figure paths. Quarto writes figures to `<name>_files/figure-markdown/`
//      beside the source; the site serves them from `/assets/<slug>/`.
//   2. Hoisting. A figure is part of its cell's output, and our code cells are
//      wrapped in `<details class="code-fold">`. Left alone, folding the code
//      would hide the figure too. Each `.cell-output-display` block is lifted
//      out of the fold and placed after it, so the figure is always visible.
//   3. Label syntax. Quarto writes `{#fig-x}` / `@fig-x`; pandoc-crossref,
//      which the site build uses, wants `{#fig:x}` / `@fig:x`.
//
// Usage: node scripts/qmd-figures.js <intermediate.md> <slug> <files-dir-name>

import { readFileSync } from 'node:fs';

/** Move `.cell-output-display` blocks out of any `<details>` that encloses them. */
export function hoistCellOutputs(md) {
  return md.replace(/<details[^>]*>[\s\S]*?<\/details>/g, (block) => {
    const hoisted = [];
    const stripped = block.replace(
      /\n*^::: \{\.cell-output[^}]*\}\n([\s\S]*?)\n:::[ \t]*$/gm,
      (_match, inner) => {
        hoisted.push(inner.trim());
        return '';
      }
    );
    if (hoisted.length === 0) return block;
    return `${stripped.trimEnd()}\n\n${hoisted.join('\n\n')}`;
  });
}

/** Point figure references at the served asset directory. */
export function rewriteFigurePaths(md, slug, filesDir) {
  return md.split(`${filesDir}/figure-markdown/`).join(`/assets/${slug}/`);
}

/** Quarto's cross-reference syntax -> pandoc-crossref's. */
export function rewriteCrossrefs(md) {
  return md.replace(/\{#fig-/g, '{#fig:').replace(/@fig-/g, '@fig:');
}

export function reconcileFigures(md, slug, filesDir) {
  return rewriteCrossrefs(rewriteFigurePaths(hoistCellOutputs(md), slug, filesDir));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [, , mdPath, slug, filesDir] = process.argv;
  if (!mdPath || !slug || !filesDir) {
    console.error('usage: qmd-figures.js <intermediate.md> <slug> <files-dir-name>');
    process.exit(1);
  }
  process.stdout.write(reconcileFigures(readFileSync(mdPath, 'utf8'), slug, filesDir));
}
