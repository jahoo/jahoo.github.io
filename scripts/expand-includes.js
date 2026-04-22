#!/usr/bin/env node
// scripts/expand-includes.js
//
// Tiny templating pass for markdown files. Expands two HTML-comment
// directives:
//
//   <!-- @cat <path> -->           inlines a file from disk (path is
//                                  relative to repo root)
//   <!-- @paste <name> -->         inlines a named build artifact
//                                  (reads _generated/_<name>.md)
//
// Each directive is replaced by the target's contents, trimmed so the
// surrounding blank lines in the template are not doubled. The rest of
// the template is passed through verbatim.
//
// Usage: node scripts/expand-includes.js <input.md> <output.md>

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIRECTIVE_RE = /<!--\s*@(cat|paste)\s+(\S+)\s*-->/g;

export function expand(template, { root = '.', generatedDir = '_generated' } = {}) {
  return template.replace(DIRECTIVE_RE, (_match, verb, arg) => {
    const path = verb === 'cat'
      ? resolve(root, arg)
      : resolve(root, generatedDir, `_${arg}.md`);
    return readFileSync(path, 'utf8').trim();
  });
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/expand-includes.js <input.md> <output.md>');
    process.exit(1);
  }
  const template = readFileSync(input, 'utf8');
  writeFileSync(output, expand(template));
  console.log(`Expanded: ${input} → ${output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
