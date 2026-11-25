# Design: shared meeting across devices

Date: 2026-11-25. Extends the trainer design (`2026-11-25-byggmax-trainer-design.md`).

## Why
The team practises from home over Teams. Each person wants the meeting on their own laptop with their own talk button.

## Ben's decisions
- Option 2: everyone on their own laptop, fully synced (not phones-as-mics, not single laptop).
- Remote use over Teams with headphones: Byggmax audio plays on every laptop by default; per-laptop "Byggmax-ljud" switch.

## How it works (Claude's calls)
- **Transport:** Supabase Realtime broadcast channel `fh-room-<CODE>` in the existing project, publishable key in `js/supabase-config.js`, supabase-js from a CDN. Presence shows who is online. No database tables.
- **Host is authoritative.** The person who starts a shared meeting is host: runs Byggmax turns, owns state, phases, agenda, timer, pause, end and debrief. Guests never call fh-turn.
- **Room code:** 4 letters (no ambiguous letters), link `?rum=CODE`. Host's URL is rewritten to the same link; a host who reloads resumes as host from localStorage.
- **Joining:** open link → team password (once) → "Vem är du?" → meeting. Name remembered per room so a reload rejoins silently. Late joiners send `hello`, host replies with a snapshot.
- **Messages:** host→all `snapshot` (whole session after every change), `live` (streaming Byggmax text, throttled), `say` (sentence + Replicate audio URL so audio is generated once), `stop`, `status`, `ended` (session incl. debrief). guest→host `hello`, `utterance`, `recording`. Anyone→all `interrupt`.
- **Talking:** each laptop shows all names but only its own button is active (others show online/offline). Space bar = own talk key in shared mode. Transcription is local (Chrome); the text goes to the host, who adds it and asks Byggmax.
- **Interrupt:** pressing your button stops Byggmax audio on every laptop.
- **Timer for guests** is derived from host's remaining time at snapshot receipt (no clock-skew issues).
- **End:** host ends; everyone sees the same debrief and gets the session saved locally for export.
- **Single-laptop mode stays** exactly as before ("Alla vid samma dator").

## Out of scope
Voice between teammates (Teams does that), host migration if the host leaves for good (guests see "Värden är borta" and the host can reopen the link).
