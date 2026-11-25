# Byggmax trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Ben chose "just start building" → native execution). Steps use `- [ ]`.

**Goal:** Voice-driven Swedish negotiation practice app (Hestra team vs AI Byggmax), hosted on GitHub Pages with Supabase Edge Functions.
**Architecture:** Static ES-module front end. Server logic is plain Web-API JavaScript handlers in `supabase/functions/_shared/` run by thin Deno entrypoints in production and by `dev/server.mjs` (Node) locally, so everything is testable before deploy.
**Tech stack:** Vanilla JS/CSS, node:test, Supabase Edge Functions (Deno), Anthropic Messages API (streaming), Replicate (`minimax/speech-2.8-turbo`, `openai/gpt-4o-transcribe`).
**Spec:** `docs/superpowers/specs/2026-11-25-byggmax-trainer-design.md` + `C:\Users\ben\Downloads\SPEC.md`.

## Global Constraints
- UI, Byggmax speech, feedback: Swedish. Code, comments, config keys: English.
- Keys only server-side (`ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `FH_TEAM_PASS`); every function checks header `x-team-pass`.
- Models: turn `claude-sonnet-5-5`, debrief `claude-opus-5-5` (one constant in `_shared/models.js`).
- Hestra floor 600,000 kr, target 750,000 kr; levels/ceilings per spec §6; concession values per spec §8.
- Chrome only, desktop only.

## Review Focus
1. Model output missing/garbled state JSON → turn still shows speech, state unchanged (test in Task 2 `parseTurnOutput`).
2. Price given as "650 000", "650 tusen", total for three stores → normalise to per-store kr (prompt asks model for per-store integer; reducer rejects non-numbers; test Task 1).
3. Push-to-talk pressed while Byggmax audio is playing or a turn is in flight → audio stops, queued sentences dropped, stale stream ignored (turn id check, Task 4).
4. Wrong/missing passphrase → clear Swedish message, re-prompt (Task 3 handler 401 test + UI).
5. Mic permission denied / no speech recognized → text fallback stays usable, Swedish error (Task 4 manual check).

---

### Task 1: Shared config + pure client logic
**Files:** `supabase/functions/_shared/{hestra.js,levels.js,personas.js,case.js}`, `js/state.js`, `js/sentences.js`, `tests/state.test.js`, `tests/sentences.test.js`, `package.json`
**Produces:**
- `initialState(settings) -> State` `{phase, agenda:{[key]:bool}, proposal:{package,pricePerStore,delivery,paymentDays}, gives:[{item,value,turn,inReturn}], gets:[{item,turn}], revealed:[ids], warnings:[{type,text,turn}], walkout, dealReached}`
- `applyUpdate(state, update, turnNo) -> State` (pure; ignores unknown fields; warnings: `below_floor` when pricePerStore < 600000, `gift_without_return`, `promised_all_feb1`, `discount_before_asking` from update.flags; values for gives looked up in `HESTRA.concessions` by key when value missing).
- `splitSentences(buffer) -> {sentences:string[], rest:string}`
- Tests: gift "montering" with no return → gives has value 75000 + warning gift_without_return; price 590000 → below_floor; garbage update → state unchanged; splitter handles "ca. 650 000 kr." and "?"/"!".

### Task 2: Prompt builder + turn output parser
**Files:** `_shared/prompt.js`, `_shared/brief.js`, `tests/prompt.test.js`
**Produces:** `buildTurnSystem({settings, brief, state}) -> string`, `buildMessages(transcript) -> messages[]`, `parseTurnOutput(text) -> {speech, persona, update|null}` with delimiter line `###STATE###`; speech format `[Inköpschef] text`.
- Tests: system prompt contains level name, ceiling and "avslöja aldrig"; parse with/without JSON; persona extracted.

### Task 3: Handlers + dev server + Deno entrypoints
**Files:** `_shared/handlers.js` (`handleConfig, handleTurn, handleTts, handleStt, handleDebrief(req, env)`), `supabase/functions/fh-*/index.ts`, `dev/server.mjs` (port 4351, loads `../WebUpdateBot/.env`-style `.env` from `forhandling/.env`), `tests/handlers.test.js`.
- `handleTurn` streams SSE: `event: speech` (text deltas, never the JSON part), `event: state`, `event: done`, `event: error`.
- Tests: 401 without pass; config returns `{replicate:bool}`.
- Verify: real turn via curl against dev server returns Swedish speech + state.

### Task 4: Front end — setup, role-play, panels, text turns
**Files:** `index.html`, `css/app.css`, `js/app.js`, `js/api.js`, `js/store.js`, `js/views/*.js`
- Setup (level, modifiers, length, roles present, personas 1/2, training wheels, push mode, panels, view/edit brief), role-play layout per spec §11, timer, manual phase move, hide panels, end meeting.

### Task 5: Voice
**Files:** `js/voice-in.js`, `js/voice-out.js`
- Buttons + keys 1–4, toggle/hold, live `webkitSpeechRecognition` sv-SE, MediaRecorder → `fh-stt`, discard/edit/send, snabbläge. TTS queue per sentence via `fh-tts`, persona voices, interrupt on any PTT, `speechSynthesis` fallback.
- Verify: measure ms from send to first audio; report.

### Task 6: Debrief + export
**Files:** `_shared/debrief.js`, `js/views/debrief.js`, `js/export.js`, `tests/export.test.js`
- Structured JSON per spec §10; speaking share computed client-side; Markdown export.

### Task 7: Evals, deploy
- `tools/eval.mjs`: acceptance checks 2–5 against dev server. Git repo, GitHub `bengibson1951-bit/forhandling`, Pages; Supabase deploy (needs Ben's `npx supabase login` once), secrets, launch.json entry, memory note.
