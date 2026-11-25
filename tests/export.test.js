import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, toMarkdown, positionPct } from '../js/export.js';
import { initialState, applyUpdate } from '../js/state.js';
import { defaultBrief } from '../supabase/functions/_shared/brief.js';

const session = () => ({
  id: 'x', startedAt: 0, endedAt: 10 * 60000,
  settings: { level: 2 }, brief: defaultBrief(),
  transcript: [
    { speaker: 'kelli', name: 'Kelli', text: 'Hej och välkomna hit' },
    { speaker: 'byggmax', persona: 'Inköpschef', text: 'Tack.' },
    { speaker: 'tova', name: 'Tova', text: 'Priset' },
  ],
  phaseLog: [{ phase: 'inledning', t: 0 }, { phase: 'utforskning', t: 4 * 60000 }],
  state: applyUpdate(initialState(), { gives: [{ key: 'montering' }], proposal: { pricePerStore: 650000 } }, 1),
  latencies: [3000, 4000, 5000],
  debrief: {
    overall: 'Bra.', techniques: [{ key: 'kvantifiera', score: 3, comment: 'Ok', line: 2 }],
    roles: [{ key: 'kelli', tip: 'Sammanfatta', line: 0 }], raqsci: { uncovered: [{ id: 'a1' }], missed: ['q1'] },
  },
});

test('speaking share, phase minutes, median latency', () => {
  const st = computeStats(session());
  assert.equal(st.speakingShare.kelli, 80);
  assert.equal(st.speakingShare.tova, 20);
  assert.equal(st.phaseMinutes.inledning, 4);
  assert.equal(st.phaseMinutes.utforskning, 6);
  assert.equal(st.medianLatencyMs, 4000);
  assert.equal(st.valueGiven, 75000);
});

test('markdown quotes the real line with the right speaker', () => {
  const md = toMarkdown(session());
  assert.match(md, /> "Priset" — Tova/);
  assert.match(md, /> "Hej och välkomna hit" — Kelli/);
  assert.match(md, /Budgettak 720 000 kr/);
  assert.match(md, /\*\*Byggmax \(Inköpschef\):\*\* Tack\./);
});

test('positionPct clamps', () => {
  assert.equal(positionPct(600000), 0);
  assert.equal(positionPct(675000), 50);
  assert.equal(positionPct(800000), 100);
  assert.equal(positionPct(null), null);
});
