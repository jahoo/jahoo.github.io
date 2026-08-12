// test/callouts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const FILTER = resolve(import.meta.dirname, '../filters/callouts.lua');

function render(markdown) {
  return execFileSync(
    'pandoc',
    ['--from', 'markdown', '--to', 'html', '--lua-filter', FILTER],
    { input: markdown, encoding: 'utf8' }
  );
}

test('existing .callout-note syntax still renders a header and body', () => {
  const html = render('::: {.callout-note}\nBody text.\n:::\n');
  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /class="callout-header"/);
  assert.match(html, /Note/);
  assert.match(html, /Body text\./);
  assert.doesNotMatch(html, /<details/);
});

test('bare .note alias renders like callout-note', () => {
  const html = render('::: {.note}\nAlias body.\n:::\n');
  assert.match(html, /class="callout note"/);
  assert.match(html, /class="callout-header"/);
  assert.match(html, /Note/);
  assert.match(html, /Alias body\./);
});

test('.warning, .tip and .important aliases map to their labels', () => {
  assert.match(render('::: {.warning}\nx\n:::\n'), /Warning/);
  assert.match(render('::: {.tip}\nx\n:::\n'), /Tip/);
  assert.match(render('::: {.important}\nx\n:::\n'), /Important/);
});

test('collapse="true" produces a closed <details> with the title as summary', () => {
  const html = render('::: {.note collapse="true"}\nHidden body.\n:::\n');
  assert.match(html, /<details class="callout-details">/);
  assert.match(html, /<summary>Note<\/summary>/);
  assert.match(html, /Hidden body\./);
  assert.doesNotMatch(html, /<details class="callout-details" open>/);
});

test('collapse="false" produces an open <details>', () => {
  const html = render('::: {.note collapse="false"}\nShown body.\n:::\n');
  assert.match(html, /<details class="callout-details" open>/);
});

test('title attribute overrides the default label and does not leak as an attribute', () => {
  const html = render('::: {.note title="Custom heading" collapse="true"}\nx\n:::\n');
  assert.match(html, /<summary>Custom heading<\/summary>/);
  assert.doesNotMatch(html, /title="Custom heading"/);
});

test('collapse attribute does not leak into the emitted div', () => {
  const html = render('::: {.note collapse="true"}\nx\n:::\n');
  assert.doesNotMatch(html, /collapse="true"/);
});

test('a div with no callout class is left alone', () => {
  const html = render('::: {.something-else}\nx\n:::\n');
  assert.doesNotMatch(html, /class="callout/);
});
