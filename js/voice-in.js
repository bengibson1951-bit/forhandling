// Push-to-talk capture: Chrome speech recognition for the live transcript, plus a
// MediaRecorder recording for the (better) server transcription.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceInSupported = { live: Boolean(SR), record: Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder) };

export class VoiceIn {
  constructor({ onInterim = () => {}, record = true }) {
    this.onInterim = onInterim;
    this.record = record && voiceInSupported.record;
    this.stream = null;
    this.active = false;
  }

  async _ensureStream() {
    if (this.stream && this.stream.active) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return this.stream;
  }

  // Throws a Swedish message if the mic cannot be used.
  async start() {
    if (this.active) return;
    this.active = true;
    this.finalText = '';
    this.interim = '';
    this.chunks = [];
    this.startedAt = Date.now();
    if (this.record) {
      try {
        const stream = await this._ensureStream();
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
        this.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
        this.rec.start(250);
      } catch (e) {
        this.active = false;
        throw new Error(e?.name === 'NotAllowedError' ? 'Mikrofonen är blockerad. Tillåt mikrofon i Chrome (ikonen i adressfältet) eller skriv i stället.' : 'Kunde inte starta mikrofonen. Skriv i stället.');
      }
    }
    if (SR) {
      const r = new SR();
      r.lang = 'sv-SE';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) this.finalText += `${res[0].transcript} `;
          else interim += res[0].transcript;
        }
        this.interim = interim;
        this.onInterim(this.liveText);
      };
      r.onerror = (e) => { if (e.error === 'not-allowed') this.srBlocked = true; };
      // Chrome stops recognition after silence; restart while the button is still active.
      r.onend = () => { if (this.active && this.sr === r) { try { r.start(); } catch { /* ignore */ } } else this._srEnded?.(); };
      this.sr = r;
      try { r.start(); } catch { /* already started */ }
    }
  }

  get liveText() { return `${this.finalText}${this.interim}`.replace(/\s+/g, ' ').trim(); }

  // Resolves with {text, blob, mime, ms}.
  async stop() {
    if (!this.active) return { text: '', blob: null, mime: '', ms: 0 };
    this.active = false;
    const ms = Date.now() - this.startedAt;
    const srDone = new Promise((res) => {
      if (!this.sr) return res();
      this._srEnded = res;
      try { this.sr.stop(); } catch { res(); }
      setTimeout(res, 1200);
    });
    const recDone = new Promise((res) => {
      if (!this.rec || this.rec.state === 'inactive') return res();
      this.rec.onstop = res;
      this.rec.stop();
    });
    await Promise.all([srDone, recDone]);
    this.sr = null;
    const mime = this.rec?.mimeType || 'audio/webm';
    const blob = this.chunks.length ? new Blob(this.chunks, { type: mime }) : null;
    this.rec = null;
    return { text: this.liveText, blob, mime: mime.split(';')[0], ms };
  }

  cancel() {
    this.active = false;
    try { this.sr?.abort(); } catch { /* ignore */ }
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch { /* ignore */ }
    this.sr = null; this.rec = null;
  }
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
