// Session statistics and Markdown export (pure).
import { ROLES, PHASES, HESTRA } from '../supabase/functions/_shared/hestra.js';
import { effectiveLevel } from '../supabase/functions/_shared/levels.js';
import { TECHNIQUES } from '../supabase/functions/_shared/debrief.js';
import { totalGiven } from './state.js';

const words = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length;
export const fmtKr = (n) => (n == null ? '–' : `${Math.round(n).toLocaleString('sv-SE').replace(/ /g, ' ')} kr`);

export function computeStats(session) {
  const t = session.transcript || [];
  const teamWords = {};
  let total = 0;
  for (const r of ROLES) teamWords[r.key] = 0;
  for (const line of t) {
    if (line.speaker === 'byggmax') continue;
    const w = words(line.text);
    teamWords[line.speaker] = (teamWords[line.speaker] || 0) + w;
    total += w;
  }
  const speakingShare = Object.fromEntries(Object.entries(teamWords).map(([k, w]) => [k, total ? Math.round((100 * w) / total) : 0]));
  const end = session.endedAt || Date.now();
  const log = session.phaseLog || [];
  const phaseMinutes = {};
  for (let i = 0; i < log.length; i++) {
    const until = log[i + 1]?.t ?? end;
    phaseMinutes[log[i].phase] = (phaseMinutes[log[i].phase] || 0) + (until - log[i].t) / 60000;
  }
  for (const k of Object.keys(phaseMinutes)) phaseMinutes[k] = Math.round(phaseMinutes[k] * 10) / 10;
  const minutes = Math.round(((end - session.startedAt) / 60000) * 10) / 10;
  const lat = (session.latencies || []).filter((x) => x > 0).sort((a, b) => a - b);
  const medianLatencyMs = lat.length ? lat[Math.floor(lat.length / 2)] : null;
  return { speakingShare, teamWords, phaseMinutes, minutes, turns: t.length, medianLatencyMs, valueGiven: totalGiven(session.state) };
}

// Position of a price on the 600k–750k scale, clamped to 0..100.
export function positionPct(price) {
  if (!price) return null;
  return Math.max(0, Math.min(100, Math.round(((price - HESTRA.floor) / (HESTRA.target - HESTRA.floor)) * 100)));
}

function lineRef(transcript, i) {
  const l = Number.isInteger(i) ? transcript[i] : null;
  if (!l) return '';
  const who = l.speaker === 'byggmax' ? `Byggmax (${l.persona || 'Inköpschef'})` : l.name;
  return `\n  > "${l.text}" — ${who}`;
}

export function toMarkdown(session) {
  const s = session.state;
  const lvl = effectiveLevel(session.settings);
  const st = computeStats(session);
  const d = session.debrief;
  const out = [];
  out.push(`# Förhandlingsträning – Byggmax`, '');
  out.push(`- Datum: ${new Date(session.startedAt).toLocaleString('sv-SE')}`);
  out.push(`- Nivå: ${lvl.level} ${lvl.name}`);
  out.push(`- Längd: ${st.minutes} min, ${st.turns} repliker`);
  out.push(`- Resultat: ${s.dealReached ? 'Affär' : s.walkout ? 'Byggmax gick från mötet' : 'Ingen affär'}`);
  out.push(`- Pris per butik: ${fmtKr(s.proposal.pricePerStore)} (tre butiker: ${fmtKr(s.proposal.pricePerStore ? s.proposal.pricePerStore * 3 : null)})`);
  out.push(`- Värde vi gett: ${fmtKr(st.valueGiven)}`, '');

  if (d) {
    out.push('## Debrief', '', d.overall || '', '');
    if (d.topThree?.length) { out.push('### Tre saker till den riktiga förhandlingen'); d.topThree.forEach((x) => out.push(`- ${x}`)); out.push(''); }
    out.push('### Tekniker');
    for (const t of d.techniques || []) {
      const name = TECHNIQUES.find((x) => x.key === t.key)?.name || t.key;
      out.push(`- **${name}** ${'★'.repeat(t.score || 0)}${'☆'.repeat(5 - (t.score || 0))} — ${t.comment}${lineRef(session.transcript, t.line)}`);
    }
    out.push('', '### Roller');
    for (const r of d.roles || []) {
      const role = ROLES.find((x) => x.key === r.key);
      out.push(`- **${role?.name || r.key}** (${st.speakingShare[r.key] ?? 0} % av teamets tal): ${r.tip}${lineRef(session.transcript, r.line)}`);
    }
    if (d.phases) out.push('', '### Faser', d.phases.comment || '', d.phases.summaryComment || '');
    const ids = Object.fromEntries((session.brief?.requirements || []).map((r) => [r.id, r.text]));
    out.push('', '### Byggmax krav (RAQSCI)');
    for (const u of d.raqsci?.uncovered || []) out.push(`- ✔ ${ids[u.id] || u.id}`);
    for (const m of d.raqsci?.missed || []) out.push(`- ✘ ${ids[m] || m}`);
    out.push('');
  }

  out.push('## Byggmax hemliga brief', '');
  out.push(`Budgettak ${fmtKr(lvl.ceiling)} per butik, öppningskrav ${fmtKr(lvl.opening)}.`, '');
  for (const r of session.brief?.requirements || []) out.push(`- [${r.level}, ${r.type}] ${r.text}`);
  out.push('', `BATNA: ${session.brief?.batna || ''}`, '');

  out.push('## Fasernas tid');
  for (const p of PHASES) if (st.phaseMinutes[p.key]) out.push(`- ${p.name}: ${st.phaseMinutes[p.key]} min`);
  out.push('', '## Transkript', '');
  for (const l of session.transcript) {
    const who = l.speaker === 'byggmax' ? `Byggmax (${l.persona || 'Inköpschef'})` : l.name;
    out.push(`**${who}:** ${l.text}`, '');
  }
  return out.join('\n');
}
