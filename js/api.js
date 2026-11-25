// Calls to the Edge Functions (or the local dev server).
const SUPABASE_FUNCTIONS = 'https://ytuhqjexdsbicdaasram.supabase.co/functions/v1';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API_BASE = isLocal ? `${location.origin}/functions/v1` : SUPABASE_FUNCTIONS;

let pass = '';
export function setPass(p) { pass = p; }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function post(fn, body, { signal } = {}) {
  let r;
  try {
    r = await fetch(`${API_BASE}/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-team-pass': pass },
      body: JSON.stringify(body || {}),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Ingen kontakt med servern. Kontrollera internet.', 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || `Fel ${r.status}`, r.status);
  return data;
}

// Streams a Byggmax turn. handlers: {persona(p), speech(text), state(obj), error(msg)}
export async function streamTurn(body, handlers, { signal } = {}) {
  let r;
  try {
    r = await fetch(`${API_BASE}/fh-turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-team-pass': pass },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Ingen kontakt med servern. Kontrollera internet.', 0);
  }
  if (!r.ok || !r.body) {
    const data = await r.json().catch(() => ({}));
    throw new ApiError(data.error || `Fel ${r.status}`, r.status);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = block.match(/^event: (\w+)/m)?.[1];
      const dataLine = block.match(/^data: (.*)$/m)?.[1];
      if (!ev || !dataLine) continue;
      let data; try { data = JSON.parse(dataLine); } catch { continue; }
      if (ev === 'persona') handlers.persona?.(data.persona, data.tone);
      else if (ev === 'speech') handlers.speech?.(data.text);
      else if (ev === 'state') handlers.state?.(data);
      else if (ev === 'error') handlers.error?.(data.error);
    }
  }
}
