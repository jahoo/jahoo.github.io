// test/qmd-figures.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hoistCellOutputs,
  rewriteFigurePaths,
  rewriteCrossrefs,
  reconcileFigures,
} from '../scripts/qmd-figures.js';

// Shape of Quarto's pre-pandoc intermediate for a labelled figure cell that the
// .qmd wrapped in a code fold.
const FOLDED_FIGURE = `<details class="code-fold">
<summary>Show/hide code</summary>

::: {.cell}
\`\`\` {.julia .cell-code}
plot(1:10)
\`\`\`

::: {.cell-output .cell-output-display execution_count=2}
![A caption.](post_files/figure-markdown/fig-demo-output-1.svg){#fig-demo}
:::
:::

</details>

See @fig-demo.
`;

test('the figure is lifted out of the code fold', () => {
  const out = hoistCellOutputs(FOLDED_FIGURE);
  const closing = out.indexOf('</details>');
  const image = out.indexOf('![A caption.]');
  assert.ok(image > closing, 'figure must come after the closing </details>');
});

test('hoisting keeps the code inside the fold', () => {
  const out = hoistCellOutputs(FOLDED_FIGURE);
  const closing = out.indexOf('</details>');
  assert.ok(out.indexOf('plot(1:10)') < closing, 'code must stay inside the fold');
});

test('hoisting removes the cell-output wrapper but keeps the image', () => {
  const out = hoistCellOutputs(FOLDED_FIGURE);
  assert.doesNotMatch(out, /cell-output-display/);
  assert.match(out, /!\[A caption\.\]/);
});

test('a fold with no cell output is left alone', () => {
  const src = `<details class="code-fold">
<summary>Show/hide code</summary>

::: {.cell}
\`\`\` {.julia .cell-code}
x = 1
\`\`\`
:::

</details>
`;
  assert.equal(hoistCellOutputs(src), src);
});

test('content outside any fold is untouched', () => {
  const src = 'Just prose.\n\n::: {.cell-output .cell-output-display}\n![x](y.svg)\n:::\n';
  assert.equal(hoistCellOutputs(src), src);
});

test('two folded figures both hoist, in order', () => {
  const out = hoistCellOutputs(FOLDED_FIGURE + '\n' + FOLDED_FIGURE.replace('fig-demo', 'fig-two'));
  assert.ok(out.indexOf('fig-demo-output-1') < out.indexOf('fig-two-output-1'));
  assert.doesNotMatch(out, /cell-output-display/);
});

test('figure paths point at the served asset directory', () => {
  const out = rewriteFigurePaths(FOLDED_FIGURE, 'my-post', 'post_files');
  assert.match(out, /\]\(\/assets\/my-post\/fig-demo-output-1\.svg\)/);
  assert.doesNotMatch(out, /figure-markdown/);
});

test('quarto cross-reference syntax becomes pandoc-crossref syntax', () => {
  const out = rewriteCrossrefs(FOLDED_FIGURE);
  assert.match(out, /\{#fig:demo\}/);
  assert.match(out, /See @fig:demo\./);
  assert.doesNotMatch(out, /\{#fig-|@fig-/);
});

test('rewriting cross-references does not touch figure filenames', () => {
  const out = reconcileFigures(FOLDED_FIGURE, 'my-post', 'post_files');
  // the file is fig-demo-output-1.svg — the `fig-` there must survive
  assert.match(out, /\/assets\/my-post\/fig-demo-output-1\.svg/);
});

test('the full pipeline produces a visible, referenced figure', () => {
  const out = reconcileFigures(FOLDED_FIGURE, 'my-post', 'post_files');
  const closing = out.indexOf('</details>');
  assert.ok(out.indexOf('![A caption.]') > closing);
  assert.match(out, /!\[A caption\.\]\(\/assets\/my-post\/fig-demo-output-1\.svg\)\{#fig:demo\}/);
  assert.match(out, /See @fig:demo\./);
  assert.ok(out.indexOf('plot(1:10)') < closing);
});
