import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../js/sentences.js';

test('splits on . ? ! followed by space', () => {
  const r = splitSentences('Hej. Hur mår ni? Bra! Och');
  assert.deepEqual(r.sentences, ['Hej.', 'Hur mår ni?', 'Bra!']);
  assert.equal(r.rest, 'Och');
});

test('does not split numbers or abbreviations', () => {
  const r = splitSentences('Vi landar på ca. 650 000 kr. per butik, t.ex. Smart. Okej');
  assert.deepEqual(r.sentences, ['Vi landar på ca. 650 000 kr. per butik, t.ex. Smart.']);
  assert.equal(r.rest, 'Okej');
});

test('keeps incomplete sentence as rest', () => {
  const r = splitSentences('Vi behöver');
  assert.deepEqual(r.sentences, []);
  assert.equal(r.rest, 'Vi behöver');
});

test('decimal numbers stay together', () => {
  const r = splitSentences('Det blir 1.5 miljoner. Klart');
  assert.deepEqual(r.sentences, ['Det blir 1.5 miljoner.']);
});
