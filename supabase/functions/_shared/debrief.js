// Debrief prompt and parser. Quotes are referenced by transcript line number so the
// client shows the real line and the real speaker.
import { HESTRA, ROLES } from './hestra.js';
import { effectiveLevel } from './levels.js';

export const TECHNIQUES = [
  { key: 'nagot_for_nagot', name: 'Något för något' },
  { key: 'kvantifiera', name: 'Kvantifiera' },
  { key: 'vardera_eftergiften', name: 'Värdera eftergiften' },
  { key: 'tempo', name: 'Tempo' },
  { key: 'tacka_satt_punkt', name: 'Tacka och sätt punkt' },
  { key: 'hall_dorren_oppen', name: 'Håll dörren öppen' },
  { key: 'fortsatt_fraga', name: 'Fortsätt fråga' },
];

export function buildDebriefSystem() {
  return `Du är en erfaren förhandlingscoach som ger feedback till ett studentteam (Hestra Inredningar) efter ett övningsmöte med Byggmax. Var konkret, ärlig och uppmuntrande. Skriv på enkel, vardaglig svenska med korta meningar — teamet är inte vana vid fackord. Undvik förkortningar som RAQSCI och BATNA; säg i stället "Byggmax krav" och "deras alternativ". Bedöm mot kursens vinnande tekniker: ${TECHNIQUES.map((t) => t.name).join(', ')}.
Hänvisa till repliker med deras radnummer (L-nummer) från transkriptet; hitta aldrig på citat. Om en teknik inte förekom, ange line som null och förklara vad de kunde ha sagt.
Svara ENDAST med ett JSON-objekt, utan kodblocksmarkering, enligt schemat:
{
  "overall": "3–5 meningar: helhetsintryck",
  "outcome": {"deal": bool, "summary": "en mening", "package": "start|smart|signatur|null", "pricePerStore": heltal eller null, "terms": "betalning/leverans kort", "valueReceived": "vad Hestra fick tillbaka, kort"},
  "raqsci": {"uncovered": [{"id": "krav-id", "line": radnummer eller null}], "missed": ["krav-id"]},
  "techniques": [{"key": "${TECHNIQUES.map((t) => t.key).join('|')}", "score": 1-5, "comment": "1–2 meningar", "line": radnummer eller null}],
  "phases": {"comment": "1–2 meningar om faserna och tempot", "endedWithSummary": bool, "summaryComment": "sammanfattade de kostnader, tidsramar och nästa steg?"},
  "roles": [{"key": "${ROLES.map((r) => r.key).join('|')}", "tip": "ett konkret tips utifrån rollens område", "line": radnummer eller null}],
  "topThree": ["tre saker att göra annorlunda i den riktiga förhandlingen"]
}
Ta med alla sju tekniker och en rad per närvarande roll.`;
}

export function buildDebriefUser({ settings = {}, brief, transcript = [], state, stats } = {}) {
  const lvl = effectiveLevel(settings);
  const lines = transcript.map((t, i) => {
    const who = t.speaker === 'byggmax' ? `Byggmax/${t.persona || 'Inköpschef'}` : t.name;
    return `L${i}: ${who}: ${t.text}`;
  }).join('\n');
  const present = ROLES.filter((r) => !settings.present || settings.present.includes(r.key));
  return `# Förutsättningar
Svårighetsnivå: ${lvl.level} ${lvl.name} (Byggmax budgettak ${lvl.ceiling} kr/butik, öppningskrav ${lvl.opening} kr).
Hestras golv ${HESTRA.floor} kr/butik, mål ${HESTRA.target} kr/butik.
Roller: ${present.map((r) => `${r.key}=${r.name} (${r.area})`).join(', ')}.
Byggmax krav (RAQSCI): ${brief.requirements.map((r) => `${r.id}: ${r.text}`).join(' | ')}

# Slutligt läge (från appen)
${JSON.stringify(state || {}, null, 0)}

# Statistik
${JSON.stringify(stats || {}, null, 0)}

# Transkript
${lines || '(tomt)'}`;
}

export function parseDebrief(text = '') {
  const a = text.indexOf('{');
  const z = text.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(text.slice(a, z + 1)); } catch { return null; }
}
