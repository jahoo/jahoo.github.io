// test/qmd-frontmatter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { swapFrontMatter } from '../scripts/qmd-frontmatter.js';

const QMD = `---
title: Rejection sampling
date: 2022-08-29
tags: [note]
unlisted: true
toc: true
css:
  - assets/css/rejection-sampling.css
bibliography: assets/rejection-sampling/references.bib
---

Prose that should be ignored.
`;

const GENERATED = `---
author:
- Jacob Hoover Vigly
authors:
- Jacob Hoover Vigly
date: 2022-08-29
tags:
- note
title: Rejection sampling
toc-title: Table of contents
unlisted: true
---

Real body.
`;

test('restores keys Quarto ate', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.match(out, /^toc: true$/m);
  assert.match(out, /assets\/css\/rejection-sampling\.css/);
  assert.match(out, /^bibliography: assets\/rejection-sampling\/references\.bib$/m);
});

test('drops the noise Quarto added', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.doesNotMatch(out, /^authors:$/m);
  assert.doesNotMatch(out, /toc-title:/);
});

test('keeps the generated body, not the qmd body', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.match(out, /Real body\./);
  assert.doesNotMatch(out, /Prose that should be ignored\./);
});

test('marks the file as generated using a YAML comment', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  // A YAML comment never reaches the rendered HTML.
  assert.match(out, /^# GENERATED FILE/m);
  const firstDelim = out.indexOf('---');
  const secondDelim = out.indexOf('\n---', firstDelim + 3);
  assert.ok(out.indexOf('# GENERATED FILE') < secondDelim,
    'marker must sit inside the YAML block');
});

test('output starts with a YAML block so pandoc parses it', () => {
  assert.ok(swapFrontMatter(GENERATED, QMD).startsWith('---\n'));
});

test('handles a generated file that has no front matter at all', () => {
  const out = swapFrontMatter('Just a body.\n', QMD);
  assert.match(out, /^---\n/);
  assert.match(out, /Just a body\./);
});

test('throws when the qmd has no front matter', () => {
  assert.throws(() => swapFrontMatter(GENERATED, 'no yaml here\n'),
    /no YAML front matter/);
});

test('a bare --- horizontal rule in the body survives, with content on both sides', () => {
  const generated = `---
title: Rejection sampling
---

Para one.

---

Para two.
`;
  const out = swapFrontMatter(generated, QMD);
  const body = out.slice(out.indexOf('Para one.'));
  assert.equal(body, 'Para one.\n\n---\n\nPara two.\n');
});

test('CRLF line endings in the generated file are handled', () => {
  const generated = '---\r\ntitle: Rejection sampling\r\n---\r\n\r\nReal body.\r\n';
  const out = swapFrontMatter(generated, QMD);
  assert.equal(out.slice(out.indexOf('Real body')), 'Real body.\r\n');
});

test('an empty YAML block in the generated file yields just the body', () => {
  const out = swapFrontMatter('---\n---\n\nBody.\n', QMD);
  assert.equal(out.slice(out.indexOf('Body.')), 'Body.\n');
});

test('an unterminated YAML block in the generated file is preserved, not dropped', () => {
  // No closing `---`, so there is nothing to strip: swapFrontMatter treats the
  // whole generated text as body rather than silently discarding content.
  const generated = '---\ntitle: X\n\nBody without closing.\n';
  const out = swapFrontMatter(generated, QMD);
  const body = out.slice(out.lastIndexOf('---\ntitle: X'));
  assert.equal(body, '---\ntitle: X\n\nBody without closing.\n');
});

test('a fully-CRLF qmd yields a YAML block with no stray carriage returns', () => {
  const qmdCRLF = '---\r\ntitle: x\r\ndate: 2022-08-29\r\ntoc: true\r\n---\r\n\r\nqmd body\r\n';
  const out = swapFrontMatter(GENERATED, qmdCRLF);
  const firstDelim = out.indexOf('---');
  const secondDelim = out.indexOf('\n---', firstDelim + 3);
  const yamlBlock = out.slice(firstDelim, secondDelim);
  assert.doesNotMatch(yamlBlock, /\r/);
});
