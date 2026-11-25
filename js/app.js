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
import { Room, makeRoomCode, normalizeRoomCode, roomLink } from './room.js';

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
  if (settings.v !== 2) { settings.voice = 'off'; settings.v = 2; store.settings = settings; } // text-only became the default
  brief = store.brief || defaultBrief();
  const p = store.pass;
  if (p) {
    try { await checkPass(p); return routeAfterPass(); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) { $('pass-error').textContent = e.message; $('pass-error').hidden = false; } }
  }
  show('pass');
  $('pass-input').focus();
}

$('pass-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('pass-error').hidden = true;
  try { await checkPass($('pass-input').value.trim()); routeAfterPass(); } catch (e) {
    $('pass-error').textContent = e.message; $('pass-error').hidden = false;
  }
});

function routeAfterPass() {
  const code = normalizeRoomCode(new URL(location.href).searchParams.get('rum'));
  if (code) return enterRoom(code);
  showSetup();
}

// ---------- Setup ----------
function defaultSettings() {
  return {
    level: DEFAULT_LEVEL, present: ROLES.map((r) => r.key), modifiers: {}, length: 45, onePersona: false,
    pttMode: 'toggle', voice: 'off', inputMode: 'voice', fast: true, panels: true, trainingWheels: false, levelValues: {}, v: 2,
  };
}

function showSetup() {
  if (!config.replicate && settings.voice === 'replicate') settings.voice = 'browser';
  renderSetup();
  show('setup');
}

// Plain-language copy for the setup screen.
const LEVEL_COPY = {
  1: 'Vänlig och öppen. Bra första övning.',
  2: 'Rimlig, men vill ha valuta för pengarna.',
  3: 'Tjatar om priset och nämner andra offerter.',
  4: 'Använder knep och ger lite. Testar er.',
  5: 'Mycket svår. Kan gå från mötet.',
};
const MODIFIER_COPY = {
  konkurrentoffert: 'Byggmax har ett billigare skriftligt bud från en annan leverantör.',
  beslutsfattarenSaknas: 'De i rummet kan inte bestämma. Allt "måste stämmas av".',
  tidspanik: 'Byggmax är mest orolig för att hinna till 1 februari.',
};
const SVGNS = 'http://www.w3.org/2000/svg';
function micIcon() {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linecap', 'round');
  s.innerHTML = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
  return h('span', { class: 'mic', 'aria-hidden': 'true' }, s);
}
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (text, color, extra = '') => h('span', { class: `avatar ${extra}`, style: color ? `--c:${color}` : null }, text);

function renderSetup() {
  const ll = $('level-list'); ll.innerHTML = '';
  for (const l of LEVELS) {
    const lab = h('label', { class: `level${settings.level === l.level ? ' sel' : ''}` },
      h('input', { type: 'radio', name: 'level', value: l.level, checked: settings.level === l.level }),
      h('span', { class: 'dots', 'aria-label': `Svårighet ${l.level} av 5` }, '●'.repeat(l.level) + '○'.repeat(5 - l.level)),
      h('strong', {}, l.name),
      h('span', { class: 'desc' }, LEVEL_COPY[l.level] || ''),
      l.level === DEFAULT_LEVEL ? h('span', { class: 'tag' }, 'Börja här') : null);
    lab.addEventListener('click', (e) => { e.preventDefault(); settings.level = l.level; saveSettings(); renderSetup(); });
    ll.append(lab);
  }
  const pl = $('present-list'); pl.innerHTML = '';
  for (const r of ROLES) {
    const on = settings.present.includes(r.key);
    const c = h('label', { class: `person${on ? ' sel' : ''}`, style: `--c: var(--${r.key})` },
      h('input', { type: 'checkbox', checked: on }),
      avatar(r.name[0], `var(--${r.key})`),
      h('span', {}, h('strong', {}, r.name), h('span', { class: 'role' }, r.area)));
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
    const c = h('label', { class: `modifier${on ? ' sel' : ''}` }, h('input', { type: 'checkbox', checked: on }),
      h('strong', {}, `${on ? '✓ ' : ''}${m.name}`), h('span', {}, MODIFIER_COPY[k] || m.text));
    c.addEventListener('click', (e) => { e.preventDefault(); settings.modifiers[k] = !on; saveSettings(); renderSetup(); });
    ml.append(c);
  }
  for (const b of $('seg-input').children) b.classList.toggle('on', b.dataset.v === settings.inputMode);
  for (const b of $('seg-voice').children) b.classList.toggle('on', b.dataset.v === (settings.voice === 'off' ? 'off' : 'on'));
  $('hint-input').textContent = settings.inputMode === 'text'
    ? 'Ni skriver era repliker i en textruta och trycker Enter.'
    : 'Klicka på ditt namn, säg det du vill säga och klicka igen när du är klar.';
  $('hint-voice').textContent = settings.voice === 'off'
    ? 'Byggmax svar visas som text på skärmen.'
    : 'Byggmax svar visas som text och läses upp. Använd hörlurar om ni sitter i Teams.';
  $('opt-length').value = String(settings.length);
  $('opt-personas').value = settings.onePersona ? '1' : '2';
  $('opt-ptt').value = settings.pttMode;
  $('opt-voice').value = settings.voice;
  $('opt-voice').querySelector('[value=replicate]').disabled = !config.replicate;
  $('opt-fast').checked = !settings.fast;
  $('opt-fast').disabled = !config.replicate;
  $('opt-panels').checked = settings.panels;
  $('opt-wheels').checked = settings.trainingWheels;
  renderBriefEditor();
}

function saveSettings() { store.settings = settings; }
$('seg-input').addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (!v) return; settings.inputMode = v; saveSettings(); renderSetup(); });
$('seg-voice').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v; if (!v) return;
  settings.voice = v === 'off' ? 'off' : (config.replicate ? 'replicate' : 'browser');
  saveSettings(); renderSetup();
});

for (const [id, key, conv] of [
  ['opt-length', 'length', Number], ['opt-personas', 'onePersona', (v) => v === '1'], ['opt-ptt', 'pttMode', String],
  ['opt-voice', 'voice', String], ['opt-fast', 'fast', (v, el) => !el.checked], ['opt-panels', 'panels', null], ['opt-wheels', 'trainingWheels', null],
]) {
  $(id).addEventListener('change', (e) => { settings[key] = conv ? conv(e.target.value, e.target) : e.target.checked; saveSettings(); });
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

function presentOk() {
  if (!settings.present.length) { $('setup-error').textContent = 'Välj minst en person som är med.'; $('setup-error').hidden = false; return false; }
  $('setup-error').hidden = true;
  return true;
}
$('btn-start').addEventListener('click', () => { if (presentOk()) startSession(); });
$('btn-start-shared').addEventListener('click', () => {
  if (!presentOk()) return;
  showWho({
    title: 'Vem är du?',
    sub: 'Du startar mötet. Sedan får du en länk att skicka till de andra i Teams-chatten.',
    roles: settings.present,
    onPick: (role) => startSession({ shared: true, role }),
    onBack: showSetup,
  });
});

// ---------- Who are you? ----------
let whoBack = null;
function showWho({ title, sub, roles, onPick, onBack }) {
  $('who-title').textContent = title;
  $('who-sub').textContent = sub || '';
  $('who-error').hidden = true;
  whoBack = onBack || null;
  $('btn-who-back').hidden = !onBack;
  const list = $('who-list'); list.innerHTML = '';
  for (const r of ROLES.filter((x) => !roles || roles.includes(x.key))) {
    const c = h('button', { class: 'person sel', type: 'button', style: `--c: var(--${r.key})` },
      avatar(r.name[0], `var(--${r.key})`), h('span', {}, h('strong', {}, r.name), h('span', { class: 'role' }, r.area)));
    c.addEventListener('click', async () => {
      for (const b of list.querySelectorAll('button')) b.disabled = true;
      try { await onPick(r.key); } catch (e) {
        show('who');
        $('who-error').textContent = e.message; $('who-error').hidden = false;
        for (const b of list.querySelectorAll('button')) b.disabled = false;
      }
    });
    list.append(c);
  }
  show('who');
}
$('btn-who-back').addEventListener('click', () => whoBack?.());

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

// Shared meeting state
let room = null;
let shared = false;        // meeting spans several laptops
let isHost = true;         // this laptop runs Byggmax
let myRole = null;         // which team member this laptop is (shared only)
let online = [];           // presence: [{id, role, host}]
let remoteRec = null;      // role currently talking on another laptop
let remoteBusy = false;    // guest: host is waiting for Byggmax
let snap = { at: 0, remainingMs: 0, paused: false };
let liveEl = null;         // guest: streaming Byggmax bubble
let currentRemoteTurn = null;
let saySeq = 0;
const ttsCache = new Map();
let helloTimer = null;
let snapshotTimer = null;
const tabId = (crypto.randomUUID?.() || String(Math.random())).slice(0, 12);

const roleByKey = (k) => ROLES.find((r) => r.key === k);
const personas = () => ((session?.settings || settings).onePersona ? [PERSONAS[0]] : PERSONAS);

async function startSession(opts = {}) {
  session = {
    id: `s${Date.now()}`, startedAt: Date.now(), endedAt: null, pausedMs: 0,
    settings: structuredClone(settings), brief: structuredClone(brief),
    transcript: [], state: initialState(), phaseLog: [{ phase: 'inledning', t: Date.now() }], latencies: [], debrief: null,
  };
  shared = Boolean(opts.shared);
  isHost = true;
  myRole = opts.role || null;
  snap = { at: 0, remainingMs: 0, paused: false };
  if (shared) {
    session.room = makeRoomCode();
    session.isHost = true;
    session.hostRole = myRole;
    sessionStorage.setItem(`fh-host-${session.room}`, '1');
    history.replaceState(null, '', roomLink(session.room));
  } else if (location.search) {
    history.replaceState(null, '', location.pathname);
  }
  enterPlay();
  if (shared) {
    try { await connectRoom(); } catch (e) { addSystem(e.message); }
  }
}

function baseVoiceMode() {
  if (isHost) return settings.voice;
  if ((session?.settings?.voice || 'off') === 'off') return 'off';
  return config.replicate ? 'replicate' : 'browser';
}

function enterPlay() {
  voiceOut?.stop();
  voiceOut = new VoiceOut({
    mode: shared && settings.soundOff ? 'off' : baseVoiceMode(),
    tts: async (text, persona, tone) => (await (ttsCache.get(persona + text) || post('fh-tts', { text, persona, tone }).then((r) => r.url))),
    personas: PERSONAS,
    onSpeaking: (p) => { speakingPersona = p; refreshStatus(); },
    onFirstAudio: () => { if (lastReleaseAt) { session.latencies.push(Date.now() - lastReleaseAt); lastReleaseAt = 0; autosave(); } },
  });
  voiceIn = new VoiceIn({ onInterim: (t) => { if (recording) $('draft-text').value = t; }, record: config.replicate });
  inputMode = settings.inputMode || 'voice';
  renderPlayHeader();
  setPanels(settings.panels);
  $('coach').hidden = true;
  hideDraft();
  renderTranscript();
  renderPtt();
  renderPanels();
  renderPeople();
  speakingPersona = null;
  show('play');
  paused = null;
  clearInterval(timerHandle);
  timerHandle = setInterval(tickTimer, 500);
  tickTimer();
  autosave();
  refreshStatus();
}

function setPanels(on) {
  $('play-grid').classList.toggle('nopanels', !on);
  $('btn-panels').textContent = on ? 'Dölj hjälprutor' : 'Visa hjälprutor';
}
$('btn-panels').addEventListener('click', () => setPanels($('play-grid').classList.contains('nopanels')));

function renderPlayHeader() {
  const lvl = effectiveLevel(session.settings);
  $('play-level').textContent = `Nivå ${lvl.level}: ${lvl.name}`;
  $('play-mods').textContent = Object.entries(session.settings.modifiers || {}).filter(([, v]) => v).map(([k]) => MODIFIERS[k].name).join(' · ');
  $('invite').hidden = !shared;
  $('invite-code').textContent = shared ? `Rumskod ${session.room}` : '';
  $('btn-copy-link').hidden = !shared;
  $('btn-sound').hidden = !shared || session.settings.voice === 'off';
  $('btn-sound').textContent = settings.soundOff ? '🔇 Ljud av' : '🔊 Ljud på';
  $('btn-end').hidden = shared && !isHost;
  $('btn-pause').hidden = shared && !isHost;
  $('btn-leave').hidden = !(shared && !isHost);
  $('people-box').hidden = !shared;
}

function renderTranscript() {
  $('transcript').innerHTML = '';
  liveEl = null;
  addSystem(`Mötet har börjat. ${personas().map((p) => `${p.name} (${p.tag})`).join(' och ')} från Byggmax är på plats. Hälsa och börja när ni är redo.`);
  if (shared) addSystem(isHost ? 'Skicka länken till de andra i Teams-chatten (knappen "Kopiera länk" uppe till höger). Använd hörlurar.' : `Du är med som ${roleByKey(myRole)?.name}. Din knapp är den som lyser. Använd hörlurar.`);
  if (!voiceInSupported.live && !voiceInSupported.record) addSystem('Den här webbläsaren stöder inte taligenkänning. Använd Chrome, eller skriv.');
  for (const l of session.transcript) {
    if (l.speaker === 'byggmax') addMsg('byggmax', l.persona, l.text);
    else addMsg('team', l.name, l.text, `var(--${l.speaker})`);
  }
}

$('btn-copy-link').addEventListener('click', async () => {
  const link = roomLink(session.room);
  try { await navigator.clipboard.writeText(link); $('btn-copy-link').textContent = 'Kopierad!'; }
  catch { prompt('Kopiera länken:', link); }
  setTimeout(() => { $('btn-copy-link').textContent = 'Kopiera länk'; }, 2000);
});
$('btn-sound').addEventListener('click', () => {
  settings.soundOff = !settings.soundOff; saveSettings();
  if (settings.soundOff) voiceOut.stop();
  voiceOut.mode = settings.soundOff ? 'off' : baseVoiceMode();
  renderPlayHeader();
});
$('btn-leave').addEventListener('click', async () => {
  if (!confirm('Lämna mötet? Du kan gå med igen via länken.')) return;
  await leaveRoom();
  voiceOut?.stop();
  clearInterval(timerHandle);
  history.replaceState(null, '', location.pathname);
  shared = false; isHost = true; myRole = null; session = null;
  showSetup();
});

// ---------- Shared meetings ----------
async function enterRoom(code) {
  // Only the browser tab that started the meeting resumes as host (survives reloads, not new tabs).
  const mine = sessionStorage.getItem(`fh-host-${code}`) && store.sessions().find((s) => s.room === code && s.isHost && !s.endedAt);
  if (mine) {
    session = mine; shared = true; isHost = true; myRole = mine.hostRole;
    enterPlay();
    try { await connectRoom(); } catch (e) { addSystem(e.message); }
    return;
  }
  const join = async (role) => {
    store.setRoomRole(code, role);
    shared = true; isHost = false; myRole = role;
    snap = { at: 0, remainingMs: 0, paused: false };
    session = { id: `g${code}`, room: code, isHost: false, startedAt: Date.now(), endedAt: null, pausedMs: 0,
      settings: structuredClone(settings), brief: structuredClone(brief), transcript: [], state: initialState(), phaseLog: [], latencies: [], debrief: null };
    enterPlay();
    await connectRoom();
  };
  const remembered = store.roomRole(code);
  if (remembered) { try { await join(remembered); return; } catch (e) { console.warn(e); } }
  showWho({ title: `Gå med i mötet ${code}`, sub: 'Vem är du? Klicka på ditt namn.', onPick: join, onBack: () => { history.replaceState(null, '', location.pathname); showSetup(); } });
}

async function connectRoom() {
  await leaveRoom();
  online = [];
  room = new Room(session.room, {
    me: { id: tabId, role: myRole, host: isHost },
    onMessage: onRoomMessage,
    onPresence: (people) => { online = people; renderPeople(); renderPtt(); refreshStatus(); if (isHost) scheduleSnapshot(); },
  });
  await room.join();
  if (isHost) broadcastSnapshot();
  else {
    room.send('hello');
    clearInterval(helloTimer);
    helloTimer = setInterval(() => { if (!snap.at) room?.send('hello'); else clearInterval(helloTimer); }, 3000);
  }
  refreshStatus();
}

async function leaveRoom() {
  clearInterval(helloTimer);
  if (room) { const r = room; room = null; await r.leave(); }
}

function renderPeople() {
  if (!session) return;
  const ul = $('people-online'); ul.innerHTML = '';
  for (const key of session.settings.present || ROLES.map((r) => r.key)) {
    const p = online.find((x) => x.role === key);
    const r = roleByKey(key);
    if (!r) continue;
    ul.append(h('li', { class: p ? '' : 'off' }, `${r.name}${key === myRole ? ' (du)' : ''}${p ? '' : ' – inte ansluten'}`));
  }
}

const hostOnline = () => online.some((p) => p.host);

function remainingMs() {
  const now = paused || Date.now();
  return session.settings.length * 60000 - (now - session.startedAt - session.pausedMs);
}

function scheduleSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(broadcastSnapshot, 80);
}

function broadcastSnapshot() {
  if (!room || !isHost || !session) return;
  room.send('snapshot', { session, busy: turnBusy, remainingMs: remainingMs(), paused: Boolean(paused) });
}

function onRoomMessage(msg) {
  switch (msg.type) {
    case 'hello': if (isHost) broadcastSnapshot(); break;
    case 'utterance':
      if (isHost && msg.text && session.settings.present.includes(msg.role) && !session.endedAt) {
        voiceOut.stop();
        if (turnBusy) mutedTurn = turnId;
        sendTeam(msg.role, String(msg.text).slice(0, 2000), Date.now());
      }
      break;
    case 'recording':
      remoteRec = msg.on ? msg.role : (remoteRec === msg.role ? null : remoteRec);
      renderPtt(); refreshStatus();
      break;
    case 'interrupt':
      voiceOut.stop();
      if (isHost && turnBusy) mutedTurn = turnId;
      if (!isHost && msg.turn != null) mutedTurn = msg.turn;
      break;
    case 'snapshot': if (!isHost) applySnapshot(msg); break;
    case 'live':
      if (!isHost && session && !session.endedAt) {
        if (!liveEl || liveEl.dataset.turn !== String(msg.turn)) { liveEl = addMsg('byggmax', msg.persona, '', null, true); liveEl.dataset.turn = String(msg.turn); }
        setWho(liveEl, msg.persona); setText(liveEl, msg.text);
        remoteBusy = true; currentRemoteTurn = msg.turn; refreshStatus();
      }
      break;
    case 'say':
      if (!isHost && msg.turn !== mutedTurn) { currentRemoteTurn = msg.turn; voiceOut.enqueueRemote(msg.seq, msg.text, msg.persona); }
      break;
    case 'sayurl': if (!isHost) voiceOut.resolveRemote(msg.seq, msg.url); break;
    case 'ended': if (!isHost) guestEnded(msg.session); break;
    default: break;
  }
}

function applySnapshot(msg) {
  const s = msg.session;
  if (!s) return;
  session = { ...s, id: `g${s.room}`, isHost: false };
  remoteBusy = Boolean(msg.busy);
  snap = { at: Date.now(), remainingMs: msg.remainingMs, paused: Boolean(msg.paused) };
  $('pause-overlay').hidden = !snap.paused;
  if (s.endedAt) return guestEnded(s);
  if ($('screen-play').hidden) show('play');
  renderPlayHeader();
  renderTranscript();
  renderPtt();
  renderPanels();
  renderPeople();
  const last = [...(s.transcript || [])].reverse().find((l) => l.speaker === 'byggmax');
  if (last?.coach && s.settings.trainingWheels) { $('coach').textContent = `💡 ${last.coach}`; $('coach').hidden = false; } else $('coach').hidden = true;
  tickTimer();
  refreshStatus();
  store.saveSession(session);
}

function guestEnded(s) {
  session = { ...s, id: `g${s.room}`, isHost: false };
  voiceOut?.stop();
  if (recording) discardDraft();
  clearInterval(timerHandle);
  store.saveSession(session);
  show('debrief');
  if (session.debrief) renderDebrief();
  else { $('debrief-body').innerHTML = ''; $('debrief-body').append(h('p', { class: 'lead' }, h('span', { class: 'spinner' }), ' Mötet är slut. Coachen läser igenom mötet… (cirka en halv minut)')); }
}

function renderPtt() {
  const row = $('ptt-row'); row.innerHTML = '';
  ROLES.forEach((r, i) => {
    if (!session.settings.present.includes(r.key)) return;
    const mine = !shared || r.key === myRole;
    const isOnline = online.some((p) => p.role === r.key);
    let sub = settings.pttMode === 'hold' ? `Håll ned · tangent ${i + 1}` : `Klicka och prata · tangent ${i + 1}`;
    if (shared && mine) sub = settings.pttMode === 'hold' ? 'Din knapp · håll ned mellanslag' : 'Din knapp · eller mellanslag';
    if (shared && !mine) sub = remoteRec === r.key ? 'Pratar nu…' : isOnline ? 'Med i mötet' : 'Inte ansluten';
    const cls = `ptt${shared ? (mine ? ' mine' : ' remote') : ''}${(remoteRec === r.key && !mine) || recording?.role === r.key ? ' rec' : ''}`;
    const b = h('button', { class: cls, type: 'button', style: `--c: var(--${r.key})`, 'data-role': r.key, title: r.area, disabled: (shared && !mine) || (recording && recording.role !== r.key) },
      micIcon(),
      h('span', {}, h('span', { class: 'name' }, r.name), h('span', { class: 'sub' }, sub)));
    if (!mine) { row.append(b); return; }
    if (settings.pttMode === 'hold') {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); pttDown(r.key); });
      b.addEventListener('pointerup', () => pttUp(r.key));
      b.addEventListener('pointercancel', () => pttUp(r.key));
    } else {
      b.addEventListener('click', () => (recording?.role === r.key ? pttUp(r.key) : pttDown(r.key)));
    }
    row.append(b);
  });
  renderWriteBox();
}

function pttButtons() { return [...document.querySelectorAll('.ptt')]; }

// Speak or write: the writing box shows who is writing; in shared meetings it is always you.
let writer = null;
let inputMode = 'voice';
function renderWriteBox() {
  if (!session) return;
  const present = ROLES.filter((r) => session.settings.present.includes(r.key));
  if (shared) writer = myRole;
  else if (!present.some((r) => r.key === writer)) writer = present[0]?.key || null;
  const box = $('write-who'); box.innerHTML = '';
  if (shared) box.append(h('span', { class: 'lbl' }, `Du skriver som ${roleByKey(myRole)?.name}`));
  else {
    box.append(h('span', { class: 'lbl' }, 'Vem skriver?'));
    present.forEach((r) => {
      const b = h('button', { type: 'button', class: writer === r.key ? 'on' : '', style: `--c: var(--${r.key})`, role: 'radio', 'aria-checked': String(writer === r.key) }, avatar(r.name[0], `var(--${r.key})`), r.name);
      b.addEventListener('click', () => { writer = r.key; renderWriteBox(); $('text-input').focus(); });
      box.append(b);
    });
  }
  const writing = inputMode === 'text';
  $('write-box').hidden = !writing;
  $('ptt-row').hidden = writing;
  $('btn-input-mode').textContent = writing ? '🎙️ Prata i stället' : '⌨️ Skriv i stället';
}
$('btn-input-mode').addEventListener('click', () => {
  inputMode = inputMode === 'text' ? 'voice' : 'text';
  if (recording) discardDraft();
  renderWriteBox(); refreshStatus();
  if (inputMode === 'text') $('text-input').focus();
});
$('text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('text-form').requestSubmit(); }
});

async function pttDown(role) {
  if (paused || session.endedAt || (shared && !isHost && snap.paused)) return;
  if (recording) return;
  voiceOut.stop();
  if (turnBusy) mutedTurn = turnId;
  if (draft) sendDraft();
  recording = { role };
  renderPtt();
  if (shared) { room?.send('interrupt', { turn: isHost ? turnId : currentRemoteTurn }); room?.send('recording', { role, on: true }); }
  if (shared && !isHost) mutedTurn = currentRemoteTurn;
  showDraft(role, '', 'Lyssnar…');
  refreshStatus();
  try { await voiceIn.start(); } catch (e) {
    recording = null; resetPtt(); hideDraft(); addSystem(e.message); refreshStatus();
    if (shared) room?.send('recording', { role, on: false });
  }
}

async function pttUp(role) {
  if (!recording || recording.role !== role) return;
  recording = null;
  resetPtt();
  if (shared) room?.send('recording', { role, on: false });
  const releasedAt = Date.now();
  $('draft-status').textContent = 'Avslutar…';
  refreshStatus();
  const { text, blob, mime } = await voiceIn.stop();
  $('draft-text').value = text;
  const wantStt = config.replicate && blob && blob.size > 2000 && (!settings.fast || !text);
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

function resetPtt() { renderPtt(); }

function showDraft(role, text, status) {
  clearTimeout(draft?.autoTimer);
  draft = { role, edited: false, sttPending: false, autoTimer: null };
  $('draft').hidden = false;
  $('draft-who').textContent = roleByKey(role).name;
  $('draft-who').style.color = `var(--${role})`;
  $('draft-text').value = text;
  $('draft-status').textContent = status || '';
  refreshStatus();
}
function hideDraft() { clearTimeout(draft?.autoTimer); draft = null; $('draft').hidden = true; refreshStatus(); }

const AUTO_SEND_MS = 1200;
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
  if (recording) { const r = recording.role; voiceIn.cancel(); recording = null; resetPtt(); if (shared) room?.send('recording', { role: r, on: false }); }
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
  if (shared) room?.send('interrupt', { turn: isHost ? turnId : currentRemoteTurn });
  sendTeam(shared ? myRole : writer, text, Date.now());
  $('text-input').focus();
});

// Keyboard: 1–4 push-to-talk, Esc discards.
const keyRole = (e) => {
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  if (shared) return (e.code === 'Space' || (idx >= 0 && ROLES[idx].key === myRole)) ? myRole : null;
  return idx >= 0 ? ROLES[idx].key : null;
};
document.addEventListener('keydown', (e) => {
  if ($('screen-play').hidden) return;
  if (e.key === 'Escape') { discardDraft(); return; }
  if (e.target.matches('input, textarea, select') || inputMode === 'text') return;
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
  if (shared && !isHost) {
    room?.send('utterance', { role, text, releasedAt });
    addMsg('team', r.name, text, `var(--${role})`, true);
    remoteBusy = true; refreshStatus();
    return;
  }
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
  let tone = null;
  let shown = '';
  let buf = '';
  let enqueued = false;
  const el = addMsg('byggmax', persona, '', null, true);
  refreshStatus();
  broadcastSnapshot();
  let lastLive = 0;
  const shareLive = () => {
    if (!room || !isHost || Date.now() - lastLive < 200) return;
    lastLive = Date.now();
    room.send('live', { text: shown.trim(), persona, turn: myTurn });
  };
  const speak = (s) => {
    if (mutedTurn === myTurn || turnId !== myTurn) return;
    if (room && isHost) {
      const seq = ++saySeq;
      const p = config.replicate && session.settings.voice !== 'off' ? post('fh-tts', { text: s, persona, tone }).then((r) => r.url).catch(() => null) : Promise.resolve(null);
      ttsCache.set(persona + s, p);
      setTimeout(() => ttsCache.delete(persona + s), 60000);
      room.send('say', { seq, text: s, persona, turn: myTurn });
      p.then((url) => room?.send('sayurl', { seq, url }));
    }
    voiceOut.enqueue(s, persona, tone); enqueued = true;
  };
  try {
    await streamTurn({ settings: session.settings, brief: session.brief, transcript: session.transcript, state: session.state }, {
      persona: (p, t) => { persona = normalizePersona(p); tone = t || tone; setWho(el, persona); },
      speech: (t) => {
        shown += t; buf += t;
        setText(el, shown.trim());
        shareLive();
        const { sentences, rest } = splitSentences(buf);
        buf = rest;
        sentences.forEach(speak);
      },
      state: (data) => {
        const finalText = (data.speech || shown).trim();
        if (buf.trim()) speak(buf.trim());
        buf = '';
        persona = normalizePersona(data.persona || persona);
        tone = data.tone || tone;
        setWho(el, persona); setText(el, finalText); el.classList.remove('pending');
        session.transcript.push({ speaker: 'byggmax', persona, tone: tone || undefined, text: finalText, t: Date.now(), coach: data.update?.coach || undefined });
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
    refreshStatus();
    autosave();
    if (turnAgain) runTurn();
  }
}

function normalizePersona(p) {
  const list = personas();
  return (list.find((x) => x.tag === p || x.key === p || x.name === p) || list[0]).tag;
}

// One clear line telling the team what is happening and what to do.
let speakingPersona = null;
function refreshStatus() {
  if (!session) return;
  const el = $('status');
  const set = (kind, text) => { el.className = `status ${kind}`; $('status-text').textContent = text; };
  const hold = settings.pttMode === 'hold';
  if (shared && !isHost && !snap.at) return set('check', hostOnline() ? 'Ansluter till mötet…' : 'Väntar på den som startade mötet…');
  if (shared && !isHost && !hostOnline()) return set('check', 'Den som startade mötet är inte ansluten just nu. Vänta en stund.');
  if (!recording && shared && remoteRec && remoteRec !== myRole) return set('rec', `${roleByKey(remoteRec).name} pratar…`);
  if (recording) {
    const n = roleByKey(recording.role).name;
    return set('rec', hold ? `${n} pratar… släpp knappen när du är klar` : `${n} pratar… klicka på ${n} igen när du är klar`);
  }
  if (draft) return set('check', draft.sttPending ? 'Lyssnar igenom det du sa…' : 'Kolla texten. Den skickas automatiskt.');
  if (speakingPersona) {
    const p = PERSONAS.find((x) => x.tag === speakingPersona);
    return set('speak', `${p ? p.name.split(' ')[0] : 'Byggmax'} från Byggmax pratar. Klicka på ditt namn för att avbryta.`);
  }
  if (turnBusy || (shared && !isHost && remoteBusy)) return set('think', 'Byggmax tänker…');
  if (session.state.walkout) return set('rec', 'Byggmax har lämnat mötet. Klicka på "Avsluta mötet" för feedback.');
  if (inputMode === 'text') return set('idle', shared ? 'Er tur. Skriv ditt svar och tryck Enter.' : 'Er tur. Välj vem som skriver, skriv och tryck Enter.');
  return set('idle', shared ? 'Er tur. Klicka på din knapp (eller mellanslag) och prata.' : 'Er tur. Klicka på ditt namn och börja prata.');
}

function addMsg(kind, who, text, color, pending = false) {
  const av = kind === 'byggmax' ? avatar(initials(personaByTagLocal(who)?.name || 'B'), null, 'bm') : avatar(who[0], color);
  const body = h('div', { class: 'text' }, text || '');
  if (pending && !text) body.append(h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
  const el = h('div', { class: `msg ${kind}${pending ? ' pending' : ''}` }, av,
    h('div', { class: 'bubble' }, h('div', { class: 'who', style: color ? `color:${color}` : null }, kind === 'byggmax' ? personaLabel(who) : who), body));
  $('transcript').append(el);
  el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return el;
}
function personaByTagLocal(tag) { return PERSONAS.find((x) => x.tag === tag); }
function personaLabel(tag) { const p = personaByTagLocal(tag); return p ? `${p.name}, ${p.tag.toLowerCase()} · Byggmax` : `Byggmax · ${tag}`; }
function setWho(el, tag) { el.querySelector('.who').textContent = personaLabel(tag); const p = personaByTagLocal(tag); if (p) el.querySelector('.avatar').textContent = initials(p.name); }
function setText(el, t) { el.querySelector('.text').textContent = t; el.scrollIntoView({ block: 'end' }); }
function addSystem(text) { const el = h('div', { class: 'msg system' }, text); $('transcript').append(el); el.scrollIntoView({ block: 'end' }); return el; }

function renderPanels() {
  const s = session.state;
  const pl = $('phase-list'); pl.innerHTML = '';
  const cur = PHASES.findIndex((p) => p.key === s.phase);
  PHASES.forEach((p, i) => {
    const li = h('li', { class: i < cur ? 'done' : i === cur ? 'cur' : '', 'data-n': String(i + 1), title: p.next ? `${p.name}. Gå vidare när: ${p.next.toLowerCase()}. Klicka för att byta fas.` : `${p.name}. Klicka för att byta fas.` }, p.name);
    li.addEventListener('click', () => {
      if (shared && !isHost) return;
      if (s.phase === p.key) return;
      s.phase = p.key; session.phaseLog.push({ phase: p.key, t: Date.now() }); renderPanels(); autosave();
    });
    pl.append(li);
  });
  const al = $('agenda-list'); al.innerHTML = '';
  for (const a of AGENDA) {
    const li = h('li', { class: s.agenda[a.key] ? 'done' : '' }, a.name);
    li.addEventListener('click', () => { if (shared && !isHost) return; s.agenda[a.key] = !s.agenda[a.key]; renderPanels(); autosave(); });
    al.append(li);
  }
  const pr = s.proposal;
  const pkg = pr.package ? HESTRA.packages[pr.package].name : '–';
  $('deal-price').textContent = pr.pricePerStore ? fmtKr(pr.pricePerStore) : 'Inget pris ännu';
  $('deal-price').style.fontSize = pr.pricePerStore ? '' : '1.1rem';
  $('deal-price-sub').textContent = pr.pricePerStore ? `per butik · ${fmtKr(pr.pricePerStore * 3)} för alla tre` : 'Priset dyker upp här när det nämns';
  $('proposal').innerHTML = '';
  for (const [k, v] of [['Paket', pkg], ['Leverans', pr.delivery || '–'], ['Betalning', pr.paymentDays ? `${pr.paymentDays} dagar` : '–']]) {
    $('proposal').append(h('dt', {}, k), h('dd', {}, v));
  }
  const fill = $('pricebar-fill');
  if (pr.pricePerStore) {
    // scale 550k..800k → 0..100 %, so 600k sits at 20 % and 750k at 80 %
    const pct = Math.max(0, Math.min(100, ((pr.pricePerStore - 550000) / 250000) * 100));
    fill.style.left = `calc(${pct}% - 2px)`; fill.style.display = 'block';
    fill.title = fmtKr(pr.pricePerStore);
  } else fill.style.display = 'none';
  const rel = Number(s.relation) || 0;
  const MOOD = { '-3': ['😠', 'Mycket dålig'], '-2': ['😤', 'Irriterade'], '-1': ['😕', 'Lite svala'], 0: ['😐', 'Neutral'], 1: ['🙂', 'Positiva'], 2: ['😊', 'Mycket positiva'], 3: ['🤩', 'Vill göra affär'] };
  const [face, label] = MOOD[rel] || MOOD[0];
  const mood = $('mood'); mood.innerHTML = '';
  mood.className = `mood${rel < 0 ? ' bad' : rel > 0 ? ' good' : ''}`;
  mood.append(h('span', { class: 'face' }, face), h('span', {}, h('strong', {}, `Byggmax: ${label}`), s.relationNote && rel !== 0 ? h('span', { class: 'why' }, s.relationNote) : null));
  const gv = $('gives'); gv.innerHTML = '';
  if (!s.gives.length) gv.append(h('li', { class: 'empty' }, 'Inget ännu. Bra!'));
  for (const g of s.gives) {
    gv.append(h('li', {}, h('span', { class: 'val' }, g.value ? fmtKr(g.value) : ''), g.item,
      h('span', { class: `ret${g.inReturn ? '' : ' none'}` }, g.inReturn ? `✓ I utbyte mot: ${g.inReturn}` : '✗ Ni fick inget tillbaka')));
  }
  $('given-total').textContent = s.gives.length ? `· värt ${fmtKr(totalGiven(s))}` : '';
  const gt = $('gets'); gt.innerHTML = '';
  if (!s.gets.length) gt.append(h('li', { class: 'empty' }, 'Inget ännu'));
  for (const g of s.gets) gt.append(h('li', {}, g.item));
  const wl = $('warnings'); wl.innerHTML = '';
  $('warnings-box').hidden = !s.warnings.length;
  for (const w of s.warnings.slice().reverse().slice(0, 4)) wl.append(h('li', {}, w.text));
}

function tickTimer() {
  if (!session || session.endedAt) return;
  const left = shared && !isHost
    ? (snap.paused ? snap.remainingMs : snap.remainingMs - (Date.now() - snap.at))
    : remainingMs();
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
  broadcastSnapshot();
});
$('btn-resume').addEventListener('click', () => {
  if (shared && !isHost) return;
  session.pausedMs += Date.now() - paused;
  paused = null;
  $('pause-overlay').hidden = true;
  broadcastSnapshot();
});

$('btn-end').addEventListener('click', () => {
  if (!confirm('Avsluta mötet och gå till debriefen?')) return;
  endSession();
});

function autosave() {
  if (!session) return;
  store.saveSession(session);
  if (shared && isHost) scheduleSnapshot();
}

async function endSession() {
  voiceOut?.stop();
  if (recording) discardDraft();
  hideDraft();
  clearInterval(timerHandle);
  session.endedAt = Date.now();
  autosave();
  if (room && isHost) room.send('ended', { session });
  show('debrief');
  await loadDebrief();
  if (room && isHost) room.send('ended', { session });
}

// ---------- Debrief ----------
async function loadDebrief() {
  const body = $('debrief-body');
  if (session.debrief) return renderDebrief();
  body.innerHTML = '';
  if (shared && !isHost) { body.append(h('p', { class: 'lead' }, 'Coachens feedback kommer från den som startade mötet.')); return renderDebrief(null, true); }
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
  if (note) body.append(h('p', { class: 'lead' }, note));
  const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', {}, title), ...kids);

  const deal = s.dealReached || Boolean(d?.outcome?.deal);
  const price = s.proposal.pricePerStore ?? d?.outcome?.pricePerStore ?? null;
  const pos = positionPct(price);
  const kind = deal ? 'good' : s.walkout ? 'bad' : 'neutral';
  const headline = deal ? 'Ni fick en affär' : s.walkout ? 'Byggmax lämnade mötet' : 'Ingen affär den här gången';
  body.append(h('section', { class: `result-banner ${kind}` },
    h('span', { class: 'emoji' }, deal ? '🤝' : s.walkout ? '🚪' : '💬'),
    h('div', {}, h('div', { class: 'big' }, headline), h('div', {}, d?.outcome?.summary || `Nivå ${lvl.level}: ${lvl.name}`))));
  body.append(h('section', { class: 'outcome' },
    stat('Pris per butik', fmtKr(price)),
    stat('Alla tre butiker', fmtKr(price ? price * 3 : null)),
    stat('Nära målet 750 000', pos == null ? '–' : `${pos} %`),
    stat('Värde ni gav bort', fmtKr(totalGiven(s))),
    stat('Byggmax gav er', s.gets.length ? `${s.gets.length} sak${s.gets.length > 1 ? 'er' : ''}` : 'Inget')));
  if (d?.outcome?.valueReceived) body.append(h('p', { class: 'lead', style: 'margin:-.4rem 0 1.2rem' }, `Ni fick tillbaka: ${d.outcome.valueReceived}`));

  if (d) {
    body.append(card('Coachens sammanfattning', h('p', {}, d.overall || '')));
    if (d.topThree?.length) body.append(card('Tre saker att ta med till det riktiga mötet', h('ol', { class: 'top3' }, d.topThree.map((x) => h('li', {}, x)))));
    const tc = card('Hur ni använde teknikerna');
    for (const t of d.techniques || []) {
      const name = TECHNIQUES.find((x) => x.key === t.key)?.name || t.key;
      const sc = Math.max(0, Math.min(5, t.score || 0));
      tc.append(h('div', { class: 'tech' }, h('strong', {}, name), h('span', { class: 'score', title: `${sc} av 5` }, '●'.repeat(sc) + '○'.repeat(5 - sc)), h('div', {}, t.comment || '', quote(t.line))));
    }
    body.append(tc);

    const ids = Object.fromEntries(session.brief.requirements.map((r) => [r.id, r]));
    const rq = h('ul', { class: 'reqs' });
    for (const u of d.raqsci?.uncovered || []) rq.append(h('li', { class: 'req-ok' }, ids[u.id]?.text || u.id, quote(u.line)));
    for (const m of d.raqsci?.missed || []) rq.append(h('li', { class: 'req-miss' }, ids[m]?.text || m));
    body.append(card('Vad Byggmax behövde: hittade ni det?', h('p', { class: 'hint' }, '✓ = ni tog reda på det · ✗ = ni missade det'), rq));

    const rc = card('Varje person');
    for (const r of d.roles || []) {
      const role = roleByKey(r.key);
      if (!role) continue;
      const share = st.speakingShare[r.key] ?? 0;
      rc.append(h('div', { class: 'tech' },
        h('span', { style: 'display:flex;gap:.6rem;align-items:center' }, avatar(role.name[0], `var(--${role.key})`), h('span', {}, h('strong', {}, role.name), h('br'), h('span', { class: 'small', style: 'color:var(--muted)' }, role.area))),
        h('span', { title: 'Andel av teamets prat' }, h('span', { class: 'share', style: `width:${Math.max(4, share * 0.6)}px` }), `${share} %`),
        h('div', {}, r.tip || '', quote(r.line))));
    }
    body.append(rc);
  }

  const ph = h('ul', {});
  for (const p of PHASES) if (st.phaseMinutes[p.key]) ph.append(h('li', {}, `${p.name}: ${st.phaseMinutes[p.key]} min`));
  const phaseCard = card('Mötets faser', ph);
  if (d?.phases) phaseCard.append(h('p', {}, d.phases.comment || ''), h('p', {}, (d.phases.endedWithSummary ? '✓ ' : '✗ ') + (d.phases.summaryComment || '')));
  body.append(phaseCard);

  if (s.warnings.length) {
    body.append(card('Det här hände under mötet', h('ul', { class: 'warnings' }, s.warnings.map((w) => h('li', {}, w.text, quote(w.turn))))));
  }

  body.append(card('Byggmax hemliga brief',
    h('p', { class: 'hint' }, 'Det här visste Byggmax, men inte ni.'),
    h('p', {}, h('strong', {}, `Högsta pris de kunde betala: ${fmtKr(lvl.ceiling)} per butik. `), `De började på ${fmtKr(lvl.opening)}.`),
    h('ul', { class: 'reqs' }, session.brief.requirements.map((r) => h('li', {}, h('strong', {}, `${r.level} (${r.type}): `), r.text, h('span', { class: 'small', style: 'color:var(--muted)' }, r.reveal === 'asked' ? ' — sa det bara om ni frågade' : ' — tog upp det själva')))),
    h('p', {}, h('strong', {}, 'Om ni inte kom överens: '), session.brief.batna)));

  const tr = h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, `Hela samtalet (${session.transcript.length} repliker)`));
  session.transcript.forEach((l) => {
    const who = l.speaker === 'byggmax' ? `Byggmax (${l.persona})` : l.name;
    tr.append(h('p', {}, h('strong', {}, `${who}: `), l.text));
  });
  body.append(tr);
  if (st.medianLatencyMs) body.append(h('p', { class: 'small', style: 'color:var(--muted)' }, `Byggmax svarstid (median): ${(st.medianLatencyMs / 1000).toFixed(1)} s`));
}

function stat(k, v) { return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)); }

$('btn-export').addEventListener('click', () => {
  const md = toMarkdown(session);
  const a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `forhandling-${new Date(session.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md` });
  document.body.append(a); a.click(); a.remove();
});
$('btn-new').addEventListener('click', async () => { await leaveRoom(); shared = false; isHost = true; myRole = null; if (location.search) history.replaceState(null, '', location.pathname); session = null; showSetup(); });

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
