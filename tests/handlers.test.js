import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleConfig, handleTurn, visibleSpeech } from '../supabase/functions/_shared/handlers.js';

const env = { FH_TEAM_PASS: 'pw', ANTHROPIC_API_KEY: 'x' };
const req = (pass, body) => new Request('http://x/fh-config', {
  method: 'POST', headers: { 'x-team-pass': pass ?? '', 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
});

test('wrong passphrase → 401', async () => {
  const r = await handleTurn(req('nope'), env);
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /lösenord/);
});

test('config reports replicate capability and hides brief unless asked', async () => {
  const a = await (await handleConfig(req('pw'), env)).json();
  assert.equal(a.replicate, false);
  assert.equal(a.brief, undefined);
  const b = await (await handleConfig(req('pw', { includeBrief: true }), { ...env, REPLICATE_API_TOKEN: 'r' })).json();
  assert.equal(b.replicate, true);
  assert.ok(b.brief.requirements.length > 5);
});

test('OPTIONS preflight passes without pass', async () => {
  const r = await handleConfig(new Request('http://x', { method: 'OPTIONS' }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('visibleSpeech hides tag, partial delimiter and state', () => {
  assert.deepEqual(visibleSpeech('[Inköp'), { persona: null, speech: '' });
  assert.deepEqual(visibleSpeech('[Inköpschef] Hej där.\n##'), { persona: 'Inköpschef', speech: 'Hej där.\n' });
  assert.deepEqual(visibleSpeech('[Inköpschef] Hej.\n###STATE###\n{"a":1}'), { persona: 'Inköpschef', speech: 'Hej.\n' });
});
