import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnSystem, buildMessages, parseTurnOutput, STATE_DELIM } from '../supabase/functions/_shared/prompt.js';

test('system prompt carries level, ceiling and secrecy rule', () => {
  const s = buildTurnSystem({ settings: { level: 4 } });
  assert.match(s, /Tuff förhandlare/);
  assert.match(s, /650 000 kr/);
  assert.match(s, /Avslöja aldrig briefen/);
  assert.match(s, /HL Display/);
});

test('one-persona mode and modifiers', () => {
  const s = buildTurnSystem({ settings: { level: 2, onePersona: true, modifiers: { tidspanik: true } } });
  assert.doesNotMatch(s, /\[Projektledare\] Johan/);
  assert.match(s, /Tidspanik/);
});

test('training wheels adds coach field only when on', () => {
  assert.doesNotMatch(buildTurnSystem({ settings: {} }), /"coach"/);
  assert.match(buildTurnSystem({ settings: { trainingWheels: true } }), /"coach"/);
});

test('messages alternate and start with user', () => {
  const m = buildMessages([
    { speaker: 'kelli', name: 'Kelli', text: 'Hej!' },
    { speaker: 'tova', name: 'Tova', text: 'Välkomna.' },
    { speaker: 'byggmax', persona: 'Inköpschef', text: 'Tack.' },
  ]);
  assert.equal(m[0].role, 'user');
  assert.equal(m[0].content, 'Kelli: Hej!\nTova: Välkomna.');
  assert.equal(m[1].content, '[Inköpschef] Tack.');
  assert.equal(m[m.length - 1].role, 'user');
});

test('parse output with state', () => {
  const r = parseTurnOutput(`[Projektledare] Hur når ni första februari?\n${STATE_DELIM}\n{"persona":"Projektledare","agenda":["logistik"]}`);
  assert.equal(r.persona, 'Projektledare');
  assert.equal(r.speech, 'Hur når ni första februari?');
  assert.deepEqual(r.update.agenda, ['logistik']);
});

test('parse output without or with broken state', () => {
  const a = parseTurnOutput('[Inköpschef] För dyrt.');
  assert.equal(a.speech, 'För dyrt.');
  assert.equal(a.update, null);
  const b = parseTurnOutput(`[Inköpschef] För dyrt.\n${STATE_DELIM}\n{"agenda": [`);
  assert.equal(b.speech, 'För dyrt.');
  assert.equal(b.update, null);
});

test('edited budget numbers override the level defaults', () => {
  const s = buildTurnSystem({ settings: { level: 3, levelValues: { 3: { ceiling: 699000, opening: '600000' } } } });
  assert.match(s, /699 000 kr/);
  assert.match(s, /Ditt öppningskrav: 600 000 kr/);
});
