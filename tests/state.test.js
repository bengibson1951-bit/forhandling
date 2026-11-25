import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyUpdate, totalGiven } from '../js/state.js';

const s0 = () => initialState();

test('free montering logs a 75,000 kr gift and a warning', () => {
  const s = applyUpdate(s0(), { gives: [{ key: 'montering', item: 'Kostnadsfri montering' }] }, 3);
  assert.equal(s.gives.length, 1);
  assert.equal(s.gives[0].value, 75000);
  assert.equal(s.gives[0].turn, 3);
  assert.ok(s.warnings.some((w) => w.type === 'gift_without_return' && w.turn === 3));
  assert.equal(totalGiven(s), 75000);
});

test('a give with something in return raises no gift warning', () => {
  const s = applyUpdate(s0(), { gives: [{ key: 'projektledarstod', inReturn: 'Ramavtal' }] }, 1);
  assert.equal(s.gives[0].value, 15000);
  assert.ok(!s.warnings.some((w) => w.type === 'gift_without_return'));
});

test('price below 600,000 per store warns once per change', () => {
  let s = applyUpdate(s0(), { proposal: { pricePerStore: 590000 } }, 5);
  assert.equal(s.proposal.pricePerStore, 590000);
  assert.ok(s.warnings.some((w) => w.type === 'below_floor'));
  s = applyUpdate(s, { proposal: { delivery: 'Etappvis' } }, 6);
  assert.equal(s.warnings.filter((w) => w.type === 'below_floor').length, 1);
});

test('price as string with spaces is normalised; nonsense ignored', () => {
  let s = applyUpdate(s0(), { proposal: { pricePerStore: '650 000' } }, 1);
  assert.equal(s.proposal.pricePerStore, 650000);
  s = applyUpdate(s, { proposal: { pricePerStore: 'dyrt' } }, 2);
  assert.equal(s.proposal.pricePerStore, 650000);
});

test('flags produce warnings', () => {
  const s = applyUpdate(s0(), { flags: { promisedAllFeb1: true, discountBeforeAsking: true } }, 2);
  const types = s.warnings.map((w) => w.type).sort();
  assert.deepEqual(types, ['discount_before_asking', 'promised_all_feb1']);
});

test('null / garbage update leaves state unchanged', () => {
  const a = s0();
  assert.deepEqual(applyUpdate(a, null, 1), a);
  assert.deepEqual(applyUpdate(a, 'x', 1), a);
  assert.deepEqual(applyUpdate(a, { phase: 'nonsense', agenda: 'priser', gives: 'x' }, 1), a);
});

test('phase, agenda, revealed, gets, walkout, deal', () => {
  const s = applyUpdate(s0(), {
    phase: 'utforskning', agenda: ['priser', 'bogus'], revealed: ['q1', 'q1'],
    gets: [{ item: 'Ramavtal 2 år' }], walkout: true, dealReached: false,
  }, 4);
  assert.equal(s.phase, 'utforskning');
  assert.equal(s.agenda.priser, true);
  assert.equal(s.agenda.bogus, undefined);
  assert.deepEqual(s.revealed, ['q1']);
  assert.equal(s.gets[0].item, 'Ramavtal 2 år');
  assert.equal(s.walkout, true);
});

test('applyUpdate does not mutate input', () => {
  const a = s0();
  const snap = JSON.stringify(a);
  applyUpdate(a, { gives: [{ key: 'montering' }], agenda: ['priser'] }, 1);
  assert.equal(JSON.stringify(a), snap);
});
