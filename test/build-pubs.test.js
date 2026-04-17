// test/build-pubs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripTitleBraces, latexEscape } from '../scripts/build-pubs.js';
import { formatAuthorsHtml, formatAuthorsBibtex } from '../scripts/build-pubs.js';

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

test('formatAuthorsHtml: single author', () => {
  assert.equal(formatAuthorsHtml(['Jacob Louis Hoover']), 'Jacob Louis Hoover');
});

test('formatAuthorsHtml: two authors', () => {
  assert.equal(
    formatAuthorsHtml(['Jacob Louis Hoover', "Timothy J. O'Donnell"]),
    "Jacob Louis Hoover, Timothy J. O'Donnell"
  );
});

test('formatAuthorsHtml: equal contribution markers', () => {
  assert.equal(
    formatAuthorsHtml(['Alice Smith', 'Bob Jones', 'Carol Lee'], [0, 1]),
    'Alice Smith*, Bob Jones*, Carol Lee'
  );
});

test('formatAuthorsBibtex: single author', () => {
  assert.equal(formatAuthorsBibtex(['Jacob Louis Hoover']), 'Hoover, Jacob Louis');
});

test('formatAuthorsBibtex: two authors joined with "and"', () => {
  assert.equal(
    formatAuthorsBibtex(['Alice Smith', 'Bob Jones']),
    'Smith, Alice and Jones, Bob'
  );
});

test('formatAuthorsBibtex: surname prefix (Van Durme)', () => {
  assert.equal(
    formatAuthorsBibtex(['Benjamin Van Durme']),
    'Van Durme, Benjamin'
  );
});

test('formatAuthorsBibtex: single-name author', () => {
  assert.equal(formatAuthorsBibtex(['Plato']), 'Plato');
});

test('formatAuthorsBibtex: apostrophe in surname', () => {
  assert.equal(
    formatAuthorsBibtex(["Timothy J. O'Donnell"]),
    "O'Donnell, Timothy J."
  );
});
