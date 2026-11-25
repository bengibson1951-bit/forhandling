// Byggmax speech output: Replicate TTS per sentence (fetched in parallel, played in order),
// with browser speechSynthesis as fallback. stop() interrupts everything.
export class VoiceOut {
  constructor({ mode = 'replicate', tts, personas = [], onSpeaking = () => {}, onFirstAudio = () => {}, onItem = null }) {
    this.onItem = onItem;        // host: called with each queued sentence (to share with other laptops)
    this.remote = new Map();     // guest: seq -> resolver for audio URLs sent by the host
    this.mode = mode;            // 'replicate' | 'browser' | 'off'
    this.tts = tts;              // async (text, persona) => url
    this.personas = personas;
    this.onSpeaking = onSpeaking;
    this.onFirstAudio = onFirstAudio;
    this.gen = 0;
    this.queue = [];
    this.playing = false;
    this.audio = new Audio();
    this.firstPending = false;
    this.svVoice = null;
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.svVoice = vs.find((v) => /sv[-_]SE/i.test(v.lang) && /natural|online|google/i.test(v.name)) || vs.find((v) => /^sv/i.test(v.lang)) || null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  // Call at the start of each Byggmax turn to measure time to first audio.
  markTurnStart() { this.firstPending = true; }

  enqueue(text, personaTag, tone) {
    if (this.mode === 'off' || !text.trim()) return;
    const gen = this.gen;
    const item = { text, personaTag, tone, gen, url: null };
    if (this.mode === 'replicate') {
      item.url = this.tts(text, personaTag, tone).catch((e) => { console.warn('tts failed, browser fallback', e); return null; });
    }
    this.queue.push(item);
    this.onItem?.(item);
    if (!this.playing) this._next();
  }

  // Guest: queue a sentence whose audio URL will arrive later from the host (or never → browser voice).
  enqueueRemote(seq, text, personaTag) {
    if (this.mode === 'off' || !text.trim()) return;
    const gen = this.gen;
    const url = new Promise((resolve) => {
      this.remote.set(seq, resolve);
      setTimeout(() => { if (this.remote.get(seq) === resolve) { this.remote.delete(seq); resolve(null); } }, 9000);
    });
    this.queue.push({ text, personaTag, gen, url: this.mode === 'replicate' ? url : null });
    if (!this.playing) this._next();
  }

  resolveRemote(seq, url) {
    const r = this.remote.get(seq);
    if (r) { this.remote.delete(seq); r(url || null); }
  }

  stop() {
    this.gen++;
    this.queue = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.playing) { this.playing = false; this.onSpeaking(null); }
  }

  get busy() { return this.playing || this.queue.length > 0; }

  async _next() {
    const item = this.queue.shift();
    if (!item) { this.playing = false; this.onSpeaking(null); return; }
    if (item.gen !== this.gen) return this._next();
    this.playing = true;
    this.onSpeaking(item.personaTag);
    const url = item.url ? await item.url : null;
    if (item.gen !== this.gen) return;
    try {
      if (url) await this._playUrl(url, item.gen);
      else await this._speakBrowser(item.text, item.personaTag, item.gen);
    } catch (e) {
      console.warn('playback error', e);
    }
    if (item.gen !== this.gen) return;
    this._next();
  }

  _first() {
    if (this.firstPending) { this.firstPending = false; this.onFirstAudio(); }
  }

  _playUrl(url, gen) {
    return new Promise((resolve) => {
      const a = this.audio;
      const done = () => { a.onended = a.onerror = null; resolve(); };
      a.onended = done;
      a.onerror = done;
      a.src = url;
      a.play().then(() => { if (gen === this.gen) this._first(); }).catch(done);
    });
  }

  _speakBrowser(text, personaTag, gen) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE';
      if (this.svVoice) u.voice = this.svVoice;
      const p = this.personas.find((x) => x.tag === personaTag);
      u.pitch = p?.voice?.browserPitch ?? 1;
      u.rate = p?.voice?.browserRate ?? 1;
      u.onstart = () => { if (gen === this.gen) this._first(); };
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}
