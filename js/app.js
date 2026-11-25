// Main controller: passphrase, setup, role-play, debrief, history.
import { post, streamTurn, setPass, ApiError } from './api.js';
import { store } from './store.js';
import { initialState, applyUpdate, totalGiven, WARNING_TEXT } from './state.js';
import { splitSentences } from './sentences.js';
import { VoiceOut } from './voice-out.js';
import { VoiceIn, voiceInSupported, blobToBase64 } from './voice-in.js';
import { computeStats, toMarkdown, fmtKr, positionPct } from './export.js';
import { HESTRA, ROLES, PHASES, AGENDA } from '../supabase/functions/_shared/hestra.js';
import { LEVELS, MODIFIERS, DEFAULT_LEVEL, effectiveLevel } from '../supabase/functions/_shared/levels.js';
import { PERSONAS } from '../supabase/functions/_shared/personas.js';
import { defaultBrief } from '../supabase/functions/_shared/brief.js';
import { TECHNIQUES } from '../supabase/functions/_shared/debrief.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};

let config = { replicate: false };
let settings = null;
let brief = null;
let session = null;

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
}

// ---------- Passphrase ----------
async function checkPass(p) {
  setPass(p);
  config = await post('fh-config', {});
  store.pass = p;
}

async function boot() {
  settings = { ...defaultSettings(), ...(store.settings || {}) };
  brief = store.brief || defaultBrief();
  const p = store.pass;
  if (p) {
    try { await checkPass(p); return showSetup(); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) { $('pass-error').textContent = e.message; $('pass-error').hidden = false; } }
  }
  show('pass');
  $('pass-input').focus();
}

$('pass-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('pass-error').hidden = true;
  try { await checkPass($('pass-input').value.trim()); showSetup(); } catch (e) {
    $('pass-error').textContent = e.message; $('pass-error').hidden = false;
  }
});

// ---------- Setup ----------
function defaultSettings() {
  return {
    level: DEFAULT_LEVEL, present: ROLES.map((r) => r.key), modifiers: {}, length: 45, onePersona: false,
    pttMode: 'toggle', voice: 'replicate', fast: false, panels: true, trainingWheels: false, levelValues: {},
  };
}

function showSetup() {
  if (!config.replicate && settings.voice === 'replicate') settings.voice = 'browser';
  renderSetup();
  show('setup');
}

function renderSetup() {
  const ll = $('level-list'); ll.innerHTML = '';
  for (const l of LEVELS) {
    const lab = h('label', { class: `level${settings.level === l.level ? ' sel' : ''}` },
      h('input', { type: 'radio', name: 'level', value: l.level, checked: settings.level === l.level }),
      h('span', { class: 'num' }, String(l.level)),
      h('span', {}, h('strong', {}, l.name + (l.level === DEFAULT_LEVEL ? ' (standard)' : '')), h('span', { class: 'desc' }, l.behaviour.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.'))));
    lab.addEventListener('click', () => { settings.level = l.level; saveSettings(); renderSetup(); });
    ll.append(lab);
  }
  const pl = $('present-list'); pl.innerHTML = '';
  for (const r of ROLES) {
    const on = settings.present.includes(r.key);
    const c = h('label', { class: `chip${on ? ' sel' : ''}`, title: r.area }, h('input', { type: 'checkbox', checked: on }), r.name);
    c.addEventListener('click', (e) => {
      e.preventDefault();
      settings.present = on ? settings.present.filter((k) => k !== r.key) : [...settings.present, r.key];
      saveSettings(); renderSetup();
    });
    pl.append(c);
  }
  const ml = $('modifier-list'); ml.innerHTML = '';
  for (const [k, m] of Object.entries(MODIFIERS)) {
    const on = Boolean(settings.modifiers[k]);
    const c = h('label', { class: `chip${on ? ' sel' : ''}`, title: m.text }, h('input', { type: 'checkbox', checked: on }), m.name);
    c.addEventListener('click', (e) => { e.preventDefault(); settings.modifiers[k] = !on; saveSettings(); renderSetup(); });
    ml.append(c);
  }
  $('opt-length').value = String(settings.length);
  $('opt-personas').value = settings.onePersona ? '1' : '2';
  $('opt-ptt').value = settings.pttMode;
  $('opt-voice').value = settings.voice;
  $('opt-voice').querySelector('[value=replicate]').disabled = !config.replicate;
  $('opt-fast').checked = settings.fast;
  $('opt-fast').disabled = !config.replicate;
  $('opt-panels').checked = settings.panels;
  $('opt-wheels').checked = settings.trainingWheels;
  renderBriefEditor();
}

function saveSettings() { store.settings = settings; }

for (const [id, key, conv] of [
  ['opt-length', 'length', Number], ['opt-personas', 'onePersona', (v) => v === '1'], ['opt-ptt', 'pttMode', String],
  ['opt-voice', 'voice', String], ['opt-fast', 'fast', null], ['opt-panels', 'panels', null], ['opt-wheels', 'trainingWheels', null],
]) {
  $(id).addEventListener('change', (e) => { settings[key] = conv ? conv(e.target.value) : e.target.checked; saveSettings(); });
}

function renderBriefEditor() {
  const box = $('brief-editor'); box.innerHTML = '';
  for (const r of brief.requirements) {
    const ta = h('textarea', { rows: 2 }); ta.value = r.text;
    ta.addEventListener('change', () => { r.text = ta.value.trim(); store.brief = brief; });
    const sel = h('select', {}, h('option', { value: 'volunteer' }, 'Säger själv'), h('option', { value: 'asked' }, 'Bara om ni frågar'));
    sel.value = r.reveal;
    sel.addEventListener('change', () => { r.reveal = sel.value; store.brief = brief; });
    box.append(h('div', { class: 'brief-req' }, h('div', {}, h('strong', {}, r.level), h('div', { class: 'muted small' }, r.type)), ta, sel));
  }
  const bt = h('textarea', { rows: 2 }); bt.value = brief.batna;
  bt.addEventListener('change', () => { brief.batna = bt.value.trim(); store.brief = brief; });
  box.append(h('div', { class: 'brief-req' }, h('strong', {}, 'BATNA'), bt, h('span')));

  const table = h('table', { class: 'brief-levels' }, h('tr', {}, h('th', {}, 'Nivå'), h('th', {}, 'Budgettak/butik'), h('th', {}, 'Öppningskrav')));
  for (const l of LEVELS) {
    const eff = effectiveLevel({ ...settings, level: l.level });
    const mk = (field) => {
      const i = h('input', { type: 'number', step: 5000, value: eff[field] });
      i.addEventListener('change', () => {
        settings.levelValues[l.level] = { ...(settings.levelValues[l.level] || {}), [field]: Number(i.value) };
        saveSettings();
      });
      return i;
    };
    table.append(h('tr', {}, h('td', {}, `${l.level} ${l.name}`), h('td', {}, mk('ceiling')), h('td', {}, mk('opening'))));
  }
  const reset = h('button', { class: 'btn ghost small', type: 'button' }, 'Återställ briefen');
  reset.addEventListener('click', () => { brief = defaultBrief(); store.brief = null; settings.levelValues = {}; saveSettings(); renderBriefEditor(); });
  box.append(table, h('p', {}, reset));
}

$('btn-start').addEventListener('click', () => {
  if (!settings.present.length) { $('setup-error').textContent = 'Välj minst en person som är med.'; $('setup-error').hidden = false; return; }
  $('setup-error').hidden = true;
  startSession();
});

// ---------- Role-play ----------
let voiceOut = null;
let voiceIn = null;
let turnBusy = false;
let turnAgain = false;
let turnId = 0;
let mutedTurn = -1;
let recording = null;      // {role}
let draft = null;          // {role, edited, sttPending, autoTimer, releasedAt}
let timerHandle = null;
let paused = null;         // timestamp when paused
let lastReleaseAt = 0;

const roleByKey = (k) => ROLES.find((r) => r.key === k);
const personas = () => (settings.onePersona ? [PERSONAS[0]] : PERSONAS);

function startSession() {
  session = {
    id: `s${Date.now()}`, startedAt: Date.now(), endedAt: null, pausedMs: 0,
    settings: structuredClone(settings), brief: structuredClone(brief),
    transcript: [], state: initialState(), phaseLog: [{ phase: 'inledning', t: Date.now() }], latencies: [], debrief: null,
  };
  voiceOut = new VoiceOut({
    mode: settings.voice,
    tts: async (text, persona) => (await post('fh-tts', { text, persona })).url,
    personas: PERSONAS,
    onSpeaking: (p) => setSpeaking(p ? `${p} talar…` : ''),
    onFirstAudio: () => { if (lastReleaseAt) { session.latencies.push(Date.now() - lastReleaseAt); lastReleaseAt = 0; autosave(); } },
  });
  voiceIn = new VoiceIn({ onInterim: (t) => { if (recording) $('draft-text').value = t; }, record: config.replicate && !settings.fast });
  const lvl = effectiveLevel(settings);
  $('play-level').textContent = `Nivå ${lvl.level}: ${lvl.name}`;
  $('play-mods').textContent = Object.entries(settings.modifiers).filter(([, v]) => v).map(([k]) => MODIFIERS[k].name).join(' · ');
  setPanels(settings.panels);
  $('transcript').innerHTML = '';
  $('coach').hidden = true;
  hideDraft();
  renderPtt();
  renderPanels();
  addSystem(`Mötet har börjat. ${personas().map((p) => `${p.name} (${p.tag})`).join(' och ')} från Byggmax är på plats. Hälsa och börja när ni är redo.`);
  if (!voiceInSupported.live && !voiceInSupported.record) addSystem('Den här webbläsaren stöder inte taligenkänning. Använd Chrome, eller skriv.');
  show('play');
  paused = null;
  clearInterval(timerHandle);
  timerHandle = setInterval(tickTimer, 500);
  tickTimer();
  autosave();
}

function setPanels(on) {
  $('play-grid').classList.toggle('nopanels', !on);
  $('btn-panels').textContent = on ? 'Dölj paneler' : 'Visa paneler';
}
$('btn-panels').addEventListener('click', () => setPanels($('play-grid').classList.contains('nopanels')));

function renderPtt() {
  const row = $('ptt-row'); row.innerHTML = '';
  const who = $('text-who'); who.innerHTML = '';
  ROLES.forEach((r, i) => {
    if (!session.settings.present.includes(r.key)) return;
    const b = h('button', { class: 'ptt', type: 'button', style: `--c: var(--${r.key})`, 'data-role': r.key },
      r.name, h('small', {}, `${i + 1} · ${settings.pttMode === 'hold' ? 'håll ned' : 'klicka'} · ${r.area}`));
    if (settings.pttMode === 'hold') {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); pttDown(r.key); });
      b.addEventListener('pointerup', () => pttUp(r.key));
      b.addEventListener('pointercancel', () => pttUp(r.key));
    } else {
      b.addEventListener('click', () => (recording?.role === r.key ? pttUp(r.key) : pttDown(r.key)));
    }
    row.append(b);
    who.append(h('option', { value: r.key }, r.name));
  });
}

function pttButtons() { return [...document.querySelectorAll('.ptt')]; }

async function pttDown(role) {
  if (paused || session.endedAt) return;
  if (recording) return;
  voiceOut.stop();
  if (turnBusy) mutedTurn = turnId;
  if (draft) sendDraft();
  recording = { role };
  for (const b of pttButtons()) {
    b.classList.toggle('rec', b.dataset.role === role);
    b.disabled = b.dataset.role !== role;
  }
  showDraft(role, '', 'Lyssnar… ' + (settings.pttMode === 'hold' ? 'släpp när du är klar' : 'klicka igen när du är klar'));
  try { await voiceIn.start(); } catch (e) {
    recording = null; resetPtt(); hideDraft(); addSystem(e.message);
  }
}

async function pttUp(role) {
  if (!recording || recording.role !== role) return;
  recording = null;
  resetPtt();
  const releasedAt = Date.now();
  $('draft-status').textContent = 'Avslutar…';
  const { text, blob, mime } = await voiceIn.stop();
  $('draft-text').value = text;
  const wantStt = config.replicate && !settings.fast && blob && blob.size > 2000;
  if (!text && !wantStt) { $('draft-status').textContent = 'Inget hördes. Försök igen eller skriv.'; setTimeout(() => { if (draft && !draft.edited && !$('draft-text').value) hideDraft(); }, 2500); return; }
  draft.releasedAt = releasedAt;
  if (wantStt) {
    draft.sttPending = true;
    $('draft-status').innerHTML = '<span class="spinner"></span> Förbättrar transkriberingen…';
    const d = draft;
    try {
      const audio = await blobToBase64(blob);
      const r = await post('fh-stt', { audio, mime });
      if (draft === d && !d.edited && r.text) $('draft-text').value = r.text;
    } catch (e) { console.warn('stt failed', e); }
    if (draft !== d) return;
    d.sttPending = false;
    if (!$('draft-text').value.trim()) { $('draft-status').textContent = 'Inget hördes. Försök igen eller skriv.'; return; }
  }
  scheduleAutoSend();
}

function resetPtt() { for (const b of pttButtons()) { b.classList.remove('rec'); b.disabled = false; } }

function showDraft(role, text, status) {
  clearTimeout(draft?.autoTimer);
  draft = { role, edited: false, sttPending: false, autoTimer: null };
  $('draft').hidden = false;
  $('draft-who').textContent = roleByKey(role).name;
  $('draft-who').style.color = `var(--${role})`;
  $('draft-text').value = text;
  $('draft-status').textContent = status || '';
}
function hideDraft() { clearTimeout(draft?.autoTimer); draft = null; $('draft').hidden = true; }

const AUTO_SEND_MS = 1500;
function scheduleAutoSend() {
  if (!draft || draft.edited) return;
  const d = draft;
  let left = AUTO_SEND_MS;
  const step = () => {
    if (draft !== d || d.edited) return;
    if (left <= 0) return sendDraft();
    $('draft-status').textContent = `Skickas om ${Math.ceil(left / 1000)} s — Esc slänger, klicka i texten för att ändra`;
    left -= 250;
    d.autoTimer = setTimeout(step, 250);
  };
  step();
}

$('draft-text').addEventListener('input', () => {
  if (!draft || recording) return;
  draft.edited = true; clearTimeout(draft.autoTimer);
  $('draft-status').textContent = 'Redigerar — Enter skickar';
});
$('draft-text').addEventListener('focus', () => {
  if (!draft || recording) return;
  draft.edited = true; clearTimeout(draft.autoTimer);
  $('draft-status').textContent = 'Redigerar — Enter skickar';
});
$('draft-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDraft(); } });
$('btn-send').addEventListener('click', () => sendDraft());
$('btn-discard').addEventListener('click', () => discardDraft());

function discardDraft() {
  if (recording) { voiceIn.cancel(); recording = null; resetPtt(); }
  hideDraft();
}

function sendDraft() {
  if (!draft || recording) return;
  const text = $('draft-text').value.trim();
  const { role, releasedAt } = draft;
  hideDraft();
  if (text) sendTeam(role, text, releasedAt);
}

$('text-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text-input').value.trim();
  if (!text) return;
  $('text-input').value = '';
  voiceOut.stop();
  if (turnBusy) mutedTurn = turnId;
  sendTeam($('text-who').value, text, Date.now());
});

// Keyboard: 1–4 push-to-talk, Esc discards.
const keyRole = (e) => {
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  return idx >= 0 ? ROLES[idx].key : null;
};
document.addEventListener('keydown', (e) => {
  if ($('screen-play').hidden) return;
  if (e.key === 'Escape') { discardDraft(); return; }
  if (e.target.matches('input, textarea, select')) return;
  const role = keyRole(e);
  if (!role || !session.settings.present.includes(role) || e.repeat) return;
  e.preventDefault();
  if (settings.pttMode === 'hold') pttDown(role);
  else if (recording?.role === role) pttUp(role);
  else pttDown(role);
});
document.addEventListener('keyup', (e) => {
  if ($('screen-play').hidden || settings.pttMode !== 'hold') return;
  const role = keyRole(e);
  if (role) pttUp(role);
});

function sendTeam(role, text, releasedAt) {
  const r = roleByKey(role);
  session.transcript.push({ speaker: role, name: r.name, text, t: Date.now() });
  addMsg('team', r.name, text, `var(--${role})`);
  lastReleaseAt = releasedAt || Date.now();
  autosave();
  if (turnBusy) turnAgain = true; else runTurn();
}

async function runTurn() {
  if (session.endedAt || session.state.walkout) return;
  turnBusy = true;
  turnAgain = false;
  const myTurn = ++turnId;
  voiceOut.markTurnStart();
  let persona = personas()[0].tag;
  let shown = '';
  let buf = '';
  let enqueued = false;
  const el = addMsg('byggmax', persona, '', null, true);
  setSpeaking('Byggmax tänker…');
  const speak = (s) => { if (mutedTurn !== myTurn && turnId === myTurn) { voiceOut.enqueue(s, persona); enqueued = true; } };
  try {
    await streamTurn({ settings: session.settings, brief: session.brief, transcript: session.transcript, state: session.state }, {
      persona: (p) => { persona = normalizePersona(p); setWho(el, persona); },
      speech: (t) => {
        shown += t; buf += t;
        setText(el, shown.trim());
        const { sentences, rest } = splitSentences(buf);
        buf = rest;
        sentences.forEach(speak);
      },
      state: (data) => {
        const finalText = (data.speech || shown).trim();
        if (buf.trim()) speak(buf.trim());
        buf = '';
        persona = normalizePersona(data.persona || persona);
        setWho(el, persona); setText(el, finalText); el.classList.remove('pending');
        session.transcript.push({ speaker: 'byggmax', persona, text: finalText, t: Date.now() });
        const before = session.state.phase;
        session.state = applyUpdate(session.state, data.update, session.transcript.length - 1);
        if (session.state.phase !== before) session.phaseLog.push({ phase: session.state.phase, t: Date.now() });
        if (data.update?.coach && session.settings.trainingWheels) { $('coach').textContent = `💡 ${data.update.coach}`; $('coach').hidden = false; }
        else $('coach').hidden = true;
        renderPanels();
        if (session.state.walkout) addSystem('Byggmax har avslutat mötet utan affär. Tryck "Avsluta mötet" för debrief.');
        else if (session.state.dealReached && data.update?.dealReached) addSystem('Det ser ut som att ni har en överenskommelse. Sammanfatta och avsluta, eller fortsätt förhandla.');
      },
      error: (msg) => { throw new Error(msg); },
    });
    if (!session.transcript.length || session.transcript[session.transcript.length - 1].speaker !== 'byggmax') throw new Error('Svaret avbröts.');
  } catch (e) {
    el.remove();
    const retry = h('button', { class: 'btn small', type: 'button' }, 'Försök igen');
    const sys = addSystem(`Byggmax svarade inte (${e.message}). `);
    sys.append(retry);
    retry.addEventListener('click', () => { sys.remove(); if (!turnBusy) runTurn(); });
  } finally {
    turnBusy = false;
    if (!enqueued && !voiceOut.busy) setSpeaking('');
    autosave();
    if (turnAgain) runTurn();
  }
}

function normalizePersona(p) {
  const list = personas();
  return (list.find((x) => x.tag === p || x.key === p || x.name === p) || list[0]).tag;
}

function setSpeaking(text) { $('speaking-now').textContent = text; }

function addMsg(kind, who, text, color, pending = false) {
  const el = h('div', { class: `msg ${kind}${pending ? ' pending' : ''}` },
    h('div', { class: 'who', style: color ? `color:${color}` : null }, kind === 'byggmax' ? personaLabel(who) : who),
    h('div', { class: 'text' }, text || (pending ? '…' : '')));
  $('transcript').append(el);
  el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return el;
}
function personaLabel(tag) { const p = PERSONAS.find((x) => x.tag === tag); return p ? `Byggmax · ${p.name} (${p.tag})` : `Byggmax · ${tag}`; }
function setWho(el, tag) { el.querySelector('.who').textContent = personaLabel(tag); }
function setText(el, t) { el.querySelector('.text').textContent = t; el.scrollIntoView({ block: 'end' }); }
function addSystem(text) { const el = h('div', { class: 'msg system' }, text); $('transcript').append(el); el.scrollIntoView({ block: 'end' }); return el; }

function renderPanels() {
  const s = session.state;
  const pl = $('phase-list'); pl.innerHTML = '';
  const cur = PHASES.findIndex((p) => p.key === s.phase);
  PHASES.forEach((p, i) => {
    const li = h('li', { class: i < cur ? 'done' : i === cur ? 'cur' : '', title: p.next ? `Gå vidare när: ${p.next}` : '' }, p.name);
    li.addEventListener('click', () => {
      if (s.phase === p.key) return;
      s.phase = p.key; session.phaseLog.push({ phase: p.key, t: Date.now() }); renderPanels(); autosave();
    });
    pl.append(li);
  });
  const al = $('agenda-list'); al.innerHTML = '';
  for (const a of AGENDA) {
    const li = h('li', { class: s.agenda[a.key] ? 'done' : '' }, a.name);
    li.addEventListener('click', () => { s.agenda[a.key] = !s.agenda[a.key]; renderPanels(); autosave(); });
    al.append(li);
  }
  const pr = s.proposal;
  const pkg = pr.package ? HESTRA.packages[pr.package].name : '–';
  $('proposal').innerHTML = '';
  for (const [k, v] of [['Paket', pkg], ['Pris/butik', fmtKr(pr.pricePerStore)], ['Tre butiker', fmtKr(pr.pricePerStore ? pr.pricePerStore * 3 : null)], ['Leverans', pr.delivery || '–'], ['Betalning', pr.paymentDays ? `${pr.paymentDays} dagar` : '–']]) {
    $('proposal').append(h('dt', {}, k), h('dd', {}, v));
  }
  const fill = $('pricebar-fill');
  if (pr.pricePerStore) {
    // scale 550k..800k → 0..100 %, so 600k sits at 20 % and 750k at 80 %
    const pct = Math.max(0, Math.min(100, ((pr.pricePerStore - 550000) / 250000) * 100));
    fill.style.left = `calc(${pct}% - 2px)`; fill.style.display = 'block';
    fill.title = fmtKr(pr.pricePerStore);
  } else fill.style.display = 'none';
  const gv = $('gives'); gv.innerHTML = '';
  if (!s.gives.length) gv.append(h('li', { class: 'empty' }, 'Inget ännu'));
  for (const g of s.gives) {
    gv.append(h('li', {}, h('span', { class: 'val' }, g.value ? fmtKr(g.value) : ''), g.item,
      h('span', { class: `ret${g.inReturn ? '' : ' none'}` }, g.inReturn ? `Mot: ${g.inReturn}` : 'Inget tillbaka')));
  }
  $('given-total').textContent = s.gives.length ? `(${fmtKr(totalGiven(s))})` : '';
  const gt = $('gets'); gt.innerHTML = '';
  if (!s.gets.length) gt.append(h('li', { class: 'empty' }, 'Inget ännu'));
  for (const g of s.gets) gt.append(h('li', {}, g.item));
  const wl = $('warnings'); wl.innerHTML = '';
  if (!s.warnings.length) wl.append(h('li', { class: 'empty', style: 'color:var(--muted)' }, 'Inga'));
  for (const w of s.warnings.slice().reverse()) wl.append(h('li', {}, w.text));
}

function tickTimer() {
  if (!session || session.endedAt) return;
  const now = paused || Date.now();
  const elapsed = now - session.startedAt - session.pausedMs;
  const left = session.settings.length * 60000 - elapsed;
  const abs = Math.abs(left);
  const mm = String(Math.floor(abs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((abs % 60000) / 1000)).padStart(2, '0');
  const t = $('timer');
  t.textContent = `${left < 0 ? '+' : ''}${mm}:${ss}`;
  t.classList.toggle('low', left >= 0 && left < 5 * 60000);
  t.classList.toggle('over', left < 0);
}

$('btn-pause').addEventListener('click', () => {
  if (paused) return;
  paused = Date.now();
  voiceOut.stop();
  if (recording) discardDraft();
  $('pause-overlay').hidden = false;
});
$('btn-resume').addEventListener('click', () => {
  session.pausedMs += Date.now() - paused;
  paused = null;
  $('pause-overlay').hidden = true;
});

$('btn-end').addEventListener('click', () => {
  if (!confirm('Avsluta mötet och gå till debriefen?')) return;
  endSession();
});

function autosave() { if (session) store.saveSession(session); }

async function endSession() {
  voiceOut?.stop();
  if (recording) discardDraft();
  hideDraft();
  clearInterval(timerHandle);
  session.endedAt = Date.now();
  autosave();
  show('debrief');
  await loadDebrief();
}

// ---------- Debrief ----------
async function loadDebrief() {
  const body = $('debrief-body');
  if (session.debrief) return renderDebrief();
  body.innerHTML = '';
  if (session.transcript.filter((t) => t.speaker !== 'byggmax').length < 2) {
    renderDebrief('För kort möte för en debrief — men här är briefen och transkriptet.');
    return;
  }
  body.append(h('p', {}, h('span', { class: 'spinner' }), ' Coachen läser igenom mötet… (cirka en halv minut)'));
  try {
    const r = await post('fh-debrief', { settings: session.settings, brief: session.brief, transcript: session.transcript, state: session.state, stats: computeStats(session) });
    session.debrief = r.debrief;
    autosave();
    renderDebrief();
  } catch (e) {
    body.innerHTML = '';
    const retry = h('button', { class: 'btn', type: 'button' }, 'Försök igen');
    retry.addEventListener('click', loadDebrief);
    body.append(h('p', { class: 'error' }, `Debriefen misslyckades: ${e.message}`), retry);
    renderDebrief(null, true);
  }
}

function quote(i) {
  const l = Number.isInteger(i) ? session.transcript[i] : null;
  if (!l) return null;
  const who = l.speaker === 'byggmax' ? `Byggmax (${l.persona || 'Inköpschef'})` : l.name;
  return h('blockquote', {}, `"${l.text}"`, h('cite', {}, `— ${who}`));
}

function renderDebrief(note, append = false) {
  const body = $('debrief-body');
  if (!append) body.innerHTML = '';
  const s = session.state;
  const d = session.debrief;
  const st = computeStats(session);
  const lvl = effectiveLevel(session.settings);
  if (note) body.append(h('p', { class: 'muted' }, note));

  const result = s.dealReached ? 'Affär' : s.walkout ? 'Byggmax gick' : (d?.outcome?.deal ? 'Affär' : 'Ingen affär');
  const price = s.proposal.pricePerStore ?? d?.outcome?.pricePerStore ?? null;
  const pos = positionPct(price);
  body.append(h('section', { class: 'outcome' },
    stat('Resultat', result),
    stat('Pris per butik', fmtKr(price)),
    stat('Tre butiker', fmtKr(price ? price * 3 : null)),
    stat('Mellan 600k och 750k', pos == null ? '–' : `${pos} %`),
    stat('Värde vi gett', fmtKr(totalGiven(s))),
    stat('Nivå', `${lvl.level} ${lvl.name}`)));
  if (d?.outcome?.summary || d?.outcome?.valueReceived) body.append(h('p', {}, d.outcome.summary || '', d.outcome.valueReceived ? h('span', { class: 'muted' }, ` Fick tillbaka: ${d.outcome.valueReceived}`) : null));

  if (d) {
    body.append(h('h2', {}, 'Helhetsintryck'), h('p', {}, d.overall || ''));
    if (d.topThree?.length) body.append(h('h2', {}, 'Tre saker till den riktiga förhandlingen'), h('ol', {}, d.topThree.map((x) => h('li', {}, x))));
    body.append(h('h2', {}, 'Teknikerna'));
    const card = h('div', { class: 'card' });
    for (const t of d.techniques || []) {
      const name = TECHNIQUES.find((x) => x.key === t.key)?.name || t.key;
      const sc = Math.max(0, Math.min(5, t.score || 0));
      card.append(h('div', { class: 'tech' }, h('strong', {}, name), h('span', { class: 'score' }, '●'.repeat(sc) + '○'.repeat(5 - sc)), h('div', {}, t.comment || '', quote(t.line))));
    }
    body.append(card);

    body.append(h('h2', {}, 'Byggmax krav — vad hittade ni?'));
    const ids = Object.fromEntries(session.brief.requirements.map((r) => [r.id, r]));
    const rq = h('ul', {});
    for (const u of d.raqsci?.uncovered || []) rq.append(h('li', { class: 'req-ok' }, ids[u.id]?.text || u.id, quote(u.line)));
    for (const m of d.raqsci?.missed || []) rq.append(h('li', { class: 'req-miss' }, ids[m]?.text || m));
    body.append(rq);

    body.append(h('h2', {}, 'Roller'));
    const rc = h('div', { class: 'card' });
    for (const r of d.roles || []) {
      const role = roleByKey(r.key);
      if (!role) continue;
      const share = st.speakingShare[r.key] ?? 0;
      rc.append(h('div', { class: 'tech' }, h('strong', {}, role.name), h('span', {}, h('span', { class: 'share', style: `width:${Math.max(4, share * 0.6)}px` }), `${share} %`), h('div', {}, h('span', { class: 'muted small' }, role.area + '. '), r.tip || '', quote(r.line))));
    }
    body.append(rc);
  }

  body.append(h('h2', {}, 'Faser och tid'));
  const ph = h('ul', {});
  for (const p of PHASES) if (st.phaseMinutes[p.key]) ph.append(h('li', {}, `${p.name}: ${st.phaseMinutes[p.key]} min`));
  body.append(ph);
  if (d?.phases) body.append(h('p', {}, d.phases.comment || ''), h('p', {}, (d.phases.endedWithSummary ? '✔ ' : '✘ ') + (d.phases.summaryComment || '')));

  if (s.warnings.length) {
    body.append(h('h2', {}, 'Varningar under mötet'));
    body.append(h('ul', {}, s.warnings.map((w) => h('li', {}, w.text, quote(w.turn)))));
  }

  body.append(h('h2', {}, 'Byggmax hemliga brief'));
  const bc = h('div', { class: 'card' },
    h('p', {}, h('strong', {}, `Budgettak: ${fmtKr(lvl.ceiling)} per butik. `), `Öppningskrav: ${fmtKr(lvl.opening)}.`),
    h('ul', {}, session.brief.requirements.map((r) => h('li', {}, h('strong', {}, `${r.level} (${r.type}): `), r.text, h('span', { class: 'muted small' }, r.reveal === 'asked' ? ' — bara om ni frågade' : ' — sa de själva')))),
    h('p', {}, h('strong', {}, 'BATNA: '), session.brief.batna));
  body.append(bc);

  if (st.medianLatencyMs) body.append(h('p', { class: 'muted small' }, `Byggmax svarstid (median, från att ni slutade prata till ljud): ${(st.medianLatencyMs / 1000).toFixed(1)} s`));

  const tr = h('details', { class: 'card' }, h('summary', {}, `Transkript (${session.transcript.length} repliker)`));
  session.transcript.forEach((l) => {
    const who = l.speaker === 'byggmax' ? `Byggmax (${l.persona})` : l.name;
    tr.append(h('p', {}, h('strong', {}, `${who}: `), l.text));
  });
  body.append(tr);
}

function stat(k, v) { return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)); }

$('btn-export').addEventListener('click', () => {
  const md = toMarkdown(session);
  const a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `forhandling-${new Date(session.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md` });
  document.body.append(a); a.click(); a.remove();
});
$('btn-new').addEventListener('click', () => { session = null; showSetup(); });

// ---------- History ----------
$('btn-history').addEventListener('click', () => {
  const list = $('history-list'); list.innerHTML = '';
  const all = store.sessions();
  if (!all.length) list.append(h('li', { class: 'card muted' }, 'Inga sparade möten ännu.'));
  for (const s of all) {
    const lvl = effectiveLevel(s.settings);
    const open = h('button', { class: 'btn', type: 'button' }, s.endedAt ? 'Visa debrief' : 'Visa');
    open.addEventListener('click', () => { session = s; show('debrief'); if (s.endedAt) loadDebrief(); else { session.endedAt = session.endedAt || Date.now(); loadDebrief(); } });
    const del = h('button', { class: 'btn ghost', type: 'button' }, 'Ta bort');
    del.addEventListener('click', () => { if (confirm('Ta bort mötet?')) { store.deleteSession(s.id); $('btn-history').click(); } });
    list.append(h('li', { class: 'card' },
      h('span', {}, h('strong', {}, new Date(s.startedAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })), ` · Nivå ${lvl.level} ${lvl.name} · ${s.transcript.length} repliker · ${s.state.dealReached ? 'Affär' : s.state.walkout ? 'Byggmax gick' : 'Ingen affär'}${s.state.proposal.pricePerStore ? ` · ${fmtKr(s.state.proposal.pricePerStore)}` : ''}`),
      h('span', {}, open, ' ', del)));
  }
  show('history');
});
$('btn-history-back').addEventListener('click', showSetup);

window.addEventListener('beforeunload', (e) => {
  if (session && !session.endedAt && session.transcript.length) { autosave(); e.preventDefault(); }
});

boot();
