# Förhandlingsträning – Byggmax

Voice role-play trainer for the Hestra team (Byggmax negotiation, 3–4 Dec 2026).
Static site (GitHub Pages) + Supabase Edge Functions (`supabase/functions/fh-*`) holding the Anthropic and Replicate keys.

- Local: `npm run dev` → http://localhost:4351 (needs `.env` with ANTHROPIC_API_KEY, REPLICATE_API_TOKEN, FH_TEAM_PASS)
- Tests: `npm test` · acceptance evals (real API calls): `npm run eval`
- Deploy functions: `npx supabase functions deploy --project-ref ytuhqjexdsbicdaasram --no-verify-jwt`
- Secrets: `npx supabase secrets set --project-ref ytuhqjexdsbicdaasram ANTHROPIC_API_KEY=… REPLICATE_API_TOKEN=… FH_TEAM_PASS=…`
- Editable assumptions: `supabase/functions/_shared/{levels,brief,personas,hestra}.js`
