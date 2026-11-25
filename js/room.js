// Live meeting sync between laptops over Supabase Realtime (broadcast + presence).
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

export function makeRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)];
  return s;
}

export function normalizeRoomCode(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  return c.length === 4 && [...c].every((ch) => CODE_LETTERS.includes(ch)) ? c : null;
}

export function roomLink(code, base = location.href) {
  const u = new URL(base);
  u.search = `?rum=${code}`;
  u.hash = '';
  return u.toString();
}

let clientPromise = null;
async function getClient() {
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2.49.4').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }));
  }
  return clientPromise;
}

export class Room {
  // me: {id, role, host}
  constructor(code, { me, onMessage = () => {}, onPresence = () => {}, onStatus = () => {} }) {
    this.code = code;
    this.me = me;
    this.onMessage = onMessage;
    this.onPresence = onPresence;
    this.onStatus = onStatus;
    this.channel = null;
  }

  async join() {
    const client = await getClient();
    const ch = client.channel(`fh-room-${this.code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.me.id } },
    });
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      if (payload && payload.from !== this.me.id) this.onMessage(payload);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const people = Object.values(state).map((metas) => metas[0]).filter(Boolean);
      this.onPresence(people);
    });
    this.channel = ch;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Kunde inte ansluta till mötet. Kontrollera internet.')), 12000);
      ch.subscribe((status) => {
        this.onStatus(status);
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error('Kunde inte ansluta till mötet.')); }
      });
    });
    await ch.track({ id: this.me.id, role: this.me.role, host: this.me.host });
  }

  send(type, data = {}) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: 'msg', payload: { ...data, type, from: this.me.id } }).catch?.(() => {});
  }

  async leave() {
    try { await this.channel?.unsubscribe(); } catch { /* ignore */ }
    this.channel = null;
  }
}
