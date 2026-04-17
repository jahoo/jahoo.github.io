// test/build-pubs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripTitleBraces, latexEscape } from '../scripts/build-pubs.js';

// Imports will be added as functions are implemented.

test('scaffold loads', () => {
  assert.ok(true);
});

test('stripTitleBraces: removes braces', () => {
  assert.equal(
    stripTitleBraces('Ensembling Language Models with Sequential {Monte Carlo}'),
    'Ensembling Language Models with Sequential Monte Carlo'
  );
});

test('stripTitleBraces: no braces unchanged', () => {
  assert.equal(stripTitleBraces('Plain Title'), 'Plain Title');
});

test('stripTitleBraces: nested/multiple braces', () => {
  assert.equal(stripTitleBraces('{ACL} {2021}: {Good} Stuff'), 'ACL 2021: Good Stuff');
});

test('latexEscape: common diacritics', () => {
  assert.equal(latexEscape('Benjamin Van Dürme'), 'Benjamin Van D{\\"u}rme');
  assert.equal(latexEscape('João'), 'Jo{\\~a}o');
  assert.equal(latexEscape('José'), "Jos{\\'e}");
  assert.equal(latexEscape('Montréal'), "Montr{\\'e}al");
});

test('latexEscape: ASCII unchanged', () => {
  assert.equal(latexEscape('Plain ASCII text'), 'Plain ASCII text');
});

test('latexEscape: empty string', () => {
  assert.equal(latexEscape(''), '');
});
