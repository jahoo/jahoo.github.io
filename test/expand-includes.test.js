// test/expand-includes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { expand } from '../scripts/expand-includes.js';

function makeRoot() {
  const root = resolve(
    tmpdir(),
    `expand-includes-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  );
  mkdirSync(resolve(root, '_generated'), { recursive: true });
  mkdirSync(resolve(root, 'content'), { recursive: true });
  return root;
}

test('@cat inlines a file from disk, trimmed', () => {
  const root = makeRoot();
  try {
    writeFileSync(resolve(root, 'content/foo.md'), '\n\nhello world\n\n');
    const input = 'before\n<!-- @cat content/foo.md -->\nafter\n';
    const out = expand(input, { root });
    assert.equal(out, 'before\nhello world\nafter\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('@paste reads _generated/_<name>.md', () => {
  const root = makeRoot();
  try {
    writeFileSync(resolve(root, '_generated/_pub-list.md'), 'LIST CONTENT\n');
    const input = 'x\n<!-- @paste pub-list -->\ny\n';
    const out = expand(input, { root });
    assert.equal(out, 'x\nLIST CONTENT\ny\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('multiple directives in one template', () => {
  const root = makeRoot();
  try {
    writeFileSync(resolve(root, 'content/a.md'), 'AAA');
    writeFileSync(resolve(root, '_generated/_b.md'), 'BBB');
    const input = '<!-- @cat content/a.md -->\n<!-- @paste b -->\n';
    const out = expand(input, { root });
    assert.equal(out, 'AAA\nBBB\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-directive comments pass through unchanged', () => {
  const input = '<!-- just a normal comment -->\nhello\n<!-- another -->\n';
  assert.equal(expand(input), input);
});

test('text with no directives passes through', () => {
  const input = '# heading\n\nsome prose about @cat and @paste in code\n';
  assert.equal(expand(input), input);
});

test('missing @cat target throws', () => {
  const root = makeRoot();
  try {
    const input = '<!-- @cat content/nonexistent.md -->';
    assert.throws(() => expand(input, { root }), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing @paste artifact throws', () => {
  const root = makeRoot();
  try {
    const input = '<!-- @paste nonexistent -->';
    assert.throws(() => expand(input, { root }), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
