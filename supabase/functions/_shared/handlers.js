// Web-API request handlers shared by Supabase Edge Functions (Deno) and dev/server.mjs (Node).
import { buildTurnSystem, buildMessages, parseTurnOutput, STATE_DELIM } from './prompt.js';
import { buildDebriefSystem, buildDebriefUser, parseDebrief } from './debrief.js';
import { defaultBrief } from './brief.js';
import { LEVELS, MODIFIERS } from './levels.js';
import { PERSONAS, personaByTag } from './personas.js';
import { MODELS } from './models.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-team-pass, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

// Returns a Response to send immediately (preflight / auth failure) or null to continue.
function gate(req, env) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!env.FH_TEAM_PASS) return json({ error: 'Servern saknar lösenordsinställning.' }, 500);
  if (req.headers.get('x-team-pass') !== env.FH_TEAM_PASS) return json({ error: 'Fel lösenord.' }, 401);
  return null;
}

async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}

export async function handleConfig(req, env) {
  const g = gate(req, env); if (g) return g;
  const body = req.method === 'POST' ? await readJson(req) : {};
  const out = {
    replicate: Boolean(env.REPLICATE_API_TOKEN),
    personas: PERSONAS.map(({ key, tag, name, role, voice }) => ({ key, tag, name, role, voice })),
    levels: LEVELS.map(({ level, name }) => ({ level, name })),
    modifiers: Object.fromEntries(Object.entries(MODIFIERS).map(([k, m]) => [k, m.name])),
  };
  if (body.includeBrief) {
    out.brief = defaultBrief();
    out.levelDetails = LEVELS;
  }
  return json(out);
}

async function anthropic(env, payload) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

// How much of the raw text can be shown as speech right now.
export function visibleSpeech(raw) {
  let text = raw;
  const d = text.indexOf(STATE_DELIM);
  if (d >= 0) text = text.slice(0, d);
  else {
    // hold back a possible partial delimiter at the end
    for (let k = Math.min(STATE_DELIM.length - 1, text.length); k > 0; k--) {
      if (STATE_DELIM.startsWith(text.slice(-k))) { text = text.slice(0, -k); break; }
    }
  }
  const t = text.trimStart();
  if (t.startsWith('[')) {
    const close = t.indexOf(']');
    if (close < 0) return { persona: null, speech: '' };
    return { persona: t.slice(1, close).trim(), speech: t.slice(close + 1).trimStart() };
  }
  return { persona: null, speech: t };
}

export async function handleTurn(req, env) {
  const g = gate(req, env); if (g) return g;
  const { settings = {}, brief, transcript = [], state } = await readJson(req);
  const upstream = await anthropic(env, {
    model: MODELS.turn,
    max_tokens: 900,
    stream: true,
    output_config: { effort: "low" }, // low effort = ~0.5 s to first word; default high thinks for ~4 s
    fallbacks: "default",
    system: buildTurnSystem({ settings, brief, state }),
    messages: buildMessages(transcript),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: 'Modellen svarade inte.', status: upstream.status, detail: detail.slice(0, 300) }, 502);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let raw = '';
      let sent = 0;
      let personaSent = false;
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            let evt; try { evt = JSON.parse(line.slice(5)); } catch { continue; }
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              raw += evt.delta.text;
              const v = visibleSpeech(raw);
              if (v.persona && !personaSent) { send('persona', { persona: v.persona }); personaSent = true; }
              if (v.speech.length > sent) { send('speech', { text: v.speech.slice(sent) }); sent = v.speech.length; }
            } else if (evt.type === 'error') {
              send('error', { error: evt.error?.message || 'Modellfel' });
            }
          }
        }
        const parsed = parseTurnOutput(raw);
        if (parsed.speech.length > sent) send('speech', { text: parsed.speech.slice(sent) });
        send('state', { persona: parsed.persona, speech: parsed.speech, update: parsed.update });
        send('done', {});
      } catch (e) {
        send('error', { error: String(e?.message || e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...CORS, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
}

async function replicateRun(env, model, input) {
  const r = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`, 'content-type': 'application/json', Prefer: 'wait=30' },
    body: JSON.stringify({ input }),
  });
  let p = await r.json();
  // fall back to polling if the synchronous wait ran out
  const t0 = Date.now();
  while (p && ['starting', 'processing'].includes(p.status) && Date.now() - t0 < 30000) {
    await new Promise((res) => setTimeout(res, 400));
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${env.REPLICATE_API_TOKEN}` } })).json();
  }
  if (!p || p.status !== 'succeeded') throw new Error(p?.error || p?.detail || `Replicate ${p?.status || r.status}`);
  return p.output;
}

export async function handleTts(req, env) {
  const g = gate(req, env); if (g) return g;
  if (!env.REPLICATE_API_TOKEN) return json({ error: 'Ingen Replicate-nyckel.' }, 501);
  const { text, persona } = await readJson(req);
  if (!text || typeof text !== 'string') return json({ error: 'Text saknas.' }, 400);
  const p = personaByTag(persona);
  try {
    const url = await replicateRun(env, MODELS.tts, {
      text: text.slice(0, 1000),
      voice_id: p.voice.replicate,
      language_boost: 'Swedish',
      audio_format: 'mp3',
      speed: 1.05,
    });
    return json({ url: Array.isArray(url) ? url[0] : url });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export async function handleStt(req, env) {
  const g = gate(req, env); if (g) return g;
  if (!env.REPLICATE_API_TOKEN) return json({ error: 'Ingen Replicate-nyckel.' }, 501);
  const { audio, mime = 'audio/webm' } = await readJson(req); // audio: base64
  if (!audio) return json({ error: 'Ljud saknas.' }, 400);
  try {
    const out = await replicateRun(env, MODELS.stt, {
      audio_file: `data:${mime};base64,${audio}`,
      language: 'sv',
      prompt: 'Förhandlingsmöte mellan Hestra Inredningar och Byggmax. Kelli, Tova, Erika, Madelene. Hestra Start, Smart, Signatur, montering, ramavtal, pop-up-butiker, kronor.',
      temperature: 0,
    });
    return json({ text: (Array.isArray(out) ? out.join('') : String(out || '')).trim() });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export async function handleDebrief(req, env) {
  const g = gate(req, env); if (g) return g;
  const { settings = {}, brief, transcript = [], state, stats } = await readJson(req);
  const r = await anthropic(env, {
    model: MODELS.debrief,
    max_tokens: 16000,
    output_config: { effort: "high" },
    fallbacks: "default",
    system: buildDebriefSystem(),
    messages: [{ role: 'user', content: buildDebriefUser({ settings, brief: brief || defaultBrief(), transcript, state, stats }) }],
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: 'Debriefen misslyckades.', detail: JSON.stringify(body).slice(0, 300) }, 502);
  const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const debrief = parseDebrief(text);
  if (!debrief) return json({ error: 'Kunde inte tolka debriefen.', raw: text.slice(0, 2000) }, 502);
  return json({ debrief });
}
