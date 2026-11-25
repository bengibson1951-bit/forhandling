// localStorage persistence.
const KEY = 'forhandling.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('save failed', e); }
}

export const store = {
  get pass() { return load().pass || ''; },
  set pass(v) { const d = load(); d.pass = v; save(d); },
  get settings() { return load().settings || null; },
  set settings(v) { const d = load(); d.settings = v; save(d); },
  get brief() { return load().brief || null; },
  set brief(v) { const d = load(); d.brief = v; save(d); },
  roomRole(code) { return (load().rooms || {})[code] || null; },
  setRoomRole(code, role) { const d = load(); d.rooms = { ...(d.rooms || {}), [code]: role }; save(d); },
  sessions() { return load().sessions || []; },
  saveSession(session) {
    const d = load();
    d.sessions = (d.sessions || []).filter((s) => s.id !== session.id);
    d.sessions.unshift(session);
    d.sessions = d.sessions.slice(0, 30);
    save(d);
  },
  deleteSession(id) {
    const d = load();
    d.sessions = (d.sessions || []).filter((s) => s.id !== id);
    save(d);
  },
};
