# Design: Byggmax role-play trainer (Förhandlingsträning)

Date: 2026-11-25 · Source spec: `C:\Users\ben\Downloads\SPEC.md` (referred to as "the spec"; it stays the authority on content, sections cited as §n). This document records how it gets built and what changed from the spec.

## Intent

Erika's course team (Kelli, Tova, Erika, Madelene, playing Hestra Inredningar) negotiates with Byggmax for real on 3–4 December 2026. They want to rehearse out loud, in Swedish, around one laptop, against an AI Byggmax whose toughness can be dialled up, and get honest feedback afterwards. Success = they rehearse several full meetings before 3 December and walk in having practised trading concessions, asking questions and closing.

**Deadline drives everything.** Today is 25 Nov. Targets: text role-play usable by 27 Nov, voice by 29 Nov, debrief by 30 Nov, leaving 1–2 Dec for rehearsals and fixes. Anything that threatens this gets cut to the "later" list (scenario modifiers and training wheels are last, as in §14).

## Goals, non-goals, anti-goals

- Goals and non-goals: as spec §1.
- Anti-goals (a failure even if it "works"):
  - Latency so long the meeting doesn't feel like a meeting (target < 3 s to first Byggmax audio, §4).
  - Byggmax that caves easily at hard levels, or reveals its ceiling/level — the practice becomes worthless.
  - Erika having to install or configure anything, or Ben's API keys being reachable from the public page.
  - Unbounded API spend if someone finds the URL.

## Constraints

- Runs in Chrome on Erika's laptop (Windows). Nothing installed.
- Hosted like Ben's other apps: static site on GitHub Pages (account `bengibson1951-bit`), deploy = commit + push.
- API keys (Anthropic, Replicate) only server-side.
- All UI/speech/feedback Swedish; code/config English (§2).

## Approaches considered

1. **GitHub Pages + Supabase Edge Functions — chosen by Ben.** Static front end; Edge Functions hold keys, call Claude/Replicate, gated by a team passphrase. Reuses Ben's existing Supabase project (free tier allows two projects).
2. GitHub Pages + Cloudflare Worker — same shape, but a new account/tool for Ben with no gain.
3. Local Node backend on Erika's laptop (the spec's original §4/§12) — rejected: install + keys on her machine + a start step each time.

## Architecture (decided)

**Front end** — `forhandling/` in the workspace, own git repo, public repo `bengibson1951-bit/forhandling`, Pages from `main` root. Static ES modules, no build step, vanilla JS + CSS (same pattern as logiktest/quiz). Local preview on port 4351 via the parent `.claude/launch.json`. No service worker (needs network anyway).

**Back end** — Supabase project `ytuhqjexdsbicdaasram` (the logiktest project), Edge Functions prefixed `fh-`:

| Function | Does |
|---|---|
| `fh-config` | Checks passphrase; returns capabilities (`replicate: true/false`), default Byggmax brief + level table (only when the setup screen asks to view/edit it), persona voice settings. |
| `fh-turn` | Builds the system prompt server-side from case background, personas, brief (default or the client's edited copy), level, modifiers, phase rules and transcript; streams Claude's reply. Emits SSE events: `speech` (text deltas, spoken part only), then one `state` event (parsed JSON), then `done`. |
| `fh-tts` | Text (one sentence) + persona → Replicate TTS → mp3 audio. |
| `fh-stt` | Recorded utterance audio → Replicate transcription → Swedish text. |
| `fh-debrief` | Full transcript + final state + brief → structured debrief JSON (separate model call, §10). |

- **Passphrase:** every function requires header `x-team-pass` equal to secret `FH_TEAM_PASS` (Ben sets it, shares with team). Entered once, kept in localStorage. Wrong pass → 401. Plus a simple per-day call cap in the function (e.g. 600 turns/day via a counter table) to bound spend.
- **Secrets:** `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN` (optional; without it the app uses browser voice), `FH_TEAM_PASS` set with `supabase secrets set`. Never in the repo.
- **Brief visibility:** default brief lives in the Edge Function source. The repo is public, so the brief is technically findable on GitHub; the team is trusted not to look (they can also view it deliberately via setup, per §3). Acceptable — the guarantee that matters is the model not revealing it in-meeting.

**Models** — per turn: a current Sonnet-class model (fast, good Swedish); debrief: a current Opus-class model. Exact IDs checked against the API docs at build time and kept in one constant.

**One turn, end to end**
1. Speaker presses their button (or key 1–4), speaks; live transcript shows; release/toggle ends; they can discard or send (or type instead).
2. Client POSTs to `fh-turn`: settings, transcript so far (speaker-tagged), current state.
3. Model output format: spoken reply first (persona tag + 1–3 sentences), then a delimiter line, then the JSON state update. The function forwards text before the delimiter as `speech` events and parses the JSON after it into the `state` event. If JSON fails to parse, the turn still stands; state is unchanged and a quiet error is logged.
4. Client splits streamed speech into sentences; each finished sentence goes to `fh-tts` immediately and plays in order (first sentence starts while the rest is generating).
5. Pressing any push-to-talk button stops audio and cancels queued sentences.

**State update JSON (per turn)** — fields: `persona`, `phase_proposal`, `agenda_ticks[]`, `gives[]` (Hestra concessions: item, value), `gets[]` (Byggmax concessions), `proposal` (package, price per store, delivery plan, payment terms), `revealed_requirements[]`, `flags` (`gift_without_return`, `promised_all_stores_feb1`, `discount_before_asking_how_much`), `walkout` (bool), `deal_reached` (bool), `coach_line` (only if training wheels on). Exact schema fixed in the plan.

**Client-side logic (pure, unit-tested):** state reducer applying updates; warnings (price < 600,000 computed client-side from proposal; the three behavioural flags from the model); concession value lookup from Hestra config; sentence splitter; timer; Markdown export.

**Voice**
**Ben's decision (2026-11-25): Replicate instead of ElevenLabs** (Ben already uses Replicate; one token, pay per use).
- STT, two layers: while the speaker talks, Chrome `webkitSpeechRecognition` (`sv-SE`, free) shows the live transcript. On release the recorded audio (MediaRecorder, webm/opus) goes to `fh-stt`, which runs a Replicate transcription model (candidate `openai/gpt-4o-transcribe`, else `vaibhavs10/incredibly-fast-whisper`, language sv) and returns the final text. The speaker sees the better text and can still discard/edit before sending. If Replicate fails or is off, the browser transcript is used as is.
- TTS: `fh-tts` runs Replicate `minimax/speech-2.8-turbo` (`language_boost: "Swedish"`, mp3) per sentence with synchronous wait, returning the audio. Two MiniMax system voices, one per persona, chosen by listening tests during the build; voice IDs in function config. Fallback: browser `speechSynthesis` with sv-SE voices.
- Latency consequence: Replicate has no streaming STT and returns whole audio files, so time to first Byggmax audio is likely ~3–5 s rather than < 3 s. Mitigations: send the first sentence to TTS the moment it is complete; keep that first sentence short (prompt rule); run STT and the Claude call back to back with no extra round trips; optional setting "snabbläge" that skips Replicate STT and uses the browser transcript directly. Measure in the build and report actual numbers to Ben.
- Model IDs and input schemas verified against Replicate at build time.

**Storage** — sessions (settings, transcript, state, debrief) autosaved to localStorage; "Exportera" downloads Markdown (transcript + debrief). Nothing stored server-side except the daily call counter. No audio stored.

**Config** — everything marked [assumption] in the spec, plus Hestra reference data (§8), lives in `config/` files: `levels.json`, `brief.default.json` (server copy), `hestra.json`, `personas.json`, `settings.defaults.json`.

## Content and behaviour

As the spec: levels and tactics §6, phases and agenda §7, deal panel and warnings §8, model rules §9, debrief §10, layout §11, acceptance checks §13, build order §14.

**1 February vs lead times (from the team's Förhandlingsplan).** Only Hestra Start (25 + 10 days) can be installed by 1 Feb from drawings approved 7 Dec; Smart and Signatur cannot. The team's own plan says to find out what *must* be in place at opening and that delivery can be split into stages. So:
- Byggmax's "Assurance of supply" must means *basic shelving and displays working in all three stores on 1 Feb*. A **phased deal** (basic/standard fittings for opening, the rest of Smart/Signatur later) satisfies it. Byggmax accepts phasing when it is explained concretely; at higher levels it pushes for everything by 1 Feb first.
- Byggmax does not know Hestra's lead times beyond what the team says, but the Projektledare persona asks how a claimed date is achievable and gets sceptical about vague promises.
- The warning "promise that all stores will be ready 1 February" fires when the team promises the *full* package in all stores by 1 Feb without a phasing/conditions caveat (e.g. dependent on drawings approved 7 Dec).
- A level-1 deal "near 750,000 kr" (acceptance check 2) is typically Signatur or Smart + paid services, delivered in phases. That counts as success; a full-Signatur-by-1-Feb promise counts as a broken promise (warning), not a broken Byggmax must.

**Value given vs received (Claude's call).** Hestra's gives are valued in kr from `hestra.json` and totalled; payment terms are shown in days (30 → 45/60) and not converted. Byggmax's gets (volume, framework agreement, future projects, fast drawing approval, payment/delivery clarity) have no kr value: the panel lists them, and the debrief judges the balance qualitatively, quoting what was traded for what. Price movement itself is shown on the price bar, not as a "give".

## Decisions made by Claude (Ben can override)

- Open decisions from §15 resolved for now: **two personas** by default (one-persona setting exists); **side panels visible** by default with a "Dölj paneler" toggle; **ceilings/opening demands as in the §6 table**, editable in `levels.json`.
- Push-to-talk default: click-to-toggle (easier with a laptop passed around); hold is a setting.
- Default session length 45 min, timer counts down but never ends the meeting by itself — just turns red.
- Repo name/folder `forhandling`; app title "Förhandlingsträning – Byggmax".

## Testing

- Unit tests (`npm test`, node:test) for reducer, warnings, sentence splitter, prompt builder (shared module used by the Edge Function), export.
- Scripted eval against the deployed `fh-turn` for acceptance checks 2–5: e.g. ask for the ceiling directly ×N at each level and grep the replies for the number; offer "kostnadsfri montering" with no ask and check the 75,000 kr gift + warning; level-5 giveaway run never closes above floor.
- Manual end-to-end voice run in Chrome before handing over.

## Left to the builder

File layout, CSS/visual style (clean, readable at arm's length, big buttons), prompt wording, exact JSON schema, call-cap number, how sentence boundaries are detected, retry/error UI.
