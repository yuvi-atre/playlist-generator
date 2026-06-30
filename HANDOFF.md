# HANDOFF.md — Running State

The PRD is the static spec. This file tracks live build progress. Update it as you go.

## Status
**Phase:** Step 4 complete — pre-filter + useCurate wired, end-to-end testable. Starting step 5 next.

## Done
- Spotify Developer app created (Client ID obtained, redirect URI set to http://127.0.0.1:5173/callback).
- Anthropic Console account + API key created.
- Spec locked (see PRD.md).
- **Step 1 — scaffold:** React 19 + Vite 8 + TypeScript 6 (strict) + Tailwind v4 + Prettier + oxlint.
- **Step 2 — Spotify OAuth + library:**
  - `src/lib/pkce.ts` — PKCE helpers (code verifier, challenge, state).
  - `src/lib/config.ts` — centralised env vars (VITE_SPOTIFY_CLIENT_ID, etc.).
  - `src/lib/storage.ts` — typed localStorage helpers (tokens, user, library cache).
  - `src/lib/spotify.ts` — full Spotify API client: PKCE auth URLs, token exchange, token refresh,
    user fetch, paginated liked-songs fetch (with 429 backoff), artist batch genre enrichment,
    Track assembly, and playlist creation stubs (used in step 6).
  - `src/hooks/useSpotifyAuth.ts` — PKCE login, token auto-refresh, logout.
  - `src/hooks/useLibrary.ts` — paginated fetch + artist enrichment + 24 h localStorage cache +
    per-track progress reporting.
  - `src/components/LoginScreen.tsx` — Spotify-branded login button.
  - `src/components/CallbackHandler.tsx` — OAuth callback: state verification + code exchange.
  - `src/components/LibraryScreen.tsx` — library stats (tracks / artists / genres) + refresh button.
  - `src/App.tsx` — routes /callback, login gate, auto-loads library on auth.
  - `.env.example` — documents required env vars.
- **Step 3 — Vercel serverless function + Anthropic key:**
  - `api/curate.ts` — POST { vibe, candidates } → Claude Sonnet → `{ tracks: [{ id, reason }] }`.
    Validates input, formats candidates as numbered list, returns strict JSON. Handles 429 + API errors.
  - `vercel.json` — SPA rewrite (all non-api routes → index.html).
  - `@anthropic-ai/sdk` added as production dep; `@vercel/node` + `vercel` as dev deps.
- **Step 4 — pre-filter + useCurate:**
  - `src/lib/preFilter.ts` — pure function. Tokenises vibe, expands tokens via keyword→genre map,
    detects era ranges (50s–2020s), scores each track (genre +3, era +2, artist match +5, name +1),
    returns top 150 `CandidateTrack[]` sorted by score then popularity.
  - `src/hooks/useCurate.ts` — chains preFilter → POST /api/curate → stores `CuratedTrack[]` result.
    Handles 429, non-ok responses, empty results, network errors.
  - `src/components/LibraryScreen.tsx` — placeholder replaced with real vibe input form +
    temporary `CurateResult` list (track name / artist / year / reason). Full review UI in step 6.

## In progress
- (nothing)

## Next step
- Build order step 5: iterate on curation quality.
  - Run `vercel dev`, log in, trigger a few vibe prompts, evaluate the results.
  - Tune pre-filter keyword map in `src/lib/preFilter.ts` if wrong genres surface.
  - Tune the system prompt in `api/curate.ts` if Claude's picks or reasons feel off.
  - Goals: tracks feel on-vibe, reasons are specific, playlist has good flow.

## Decisions log
- Two-stage curation (code pre-filter → Claude pass). [PRD §8]
- Vercel serverless backend holds the Anthropic key. [PRD §9]
- Model A: single shared key + Console spend cap. [PRD §9]
- Claude Sonnet for curation. [PRD §9]
- Playlists private by default. [PRD §6]
- Tailwind v4 (Vite plugin, no config file). @tailwindcss/vite.
- Linting: oxlint (template default) + Prettier for formatting.
- Library cache TTL: 24 h. Manual refresh button always available.
- `getAccessToken()` uses a ref internally so it never changes identity — safe as a hook dep.

## Blockers
- (none)

## Notes for next session
- Run with `vercel dev` (not `npm run dev`) — this serves both the Vite frontend and the api/ function.
- Spotify redirect URI for dev is http://127.0.0.1:5173/callback; `vercel dev` proxies to Vite on that port.
- Tuning levers: pre-filter keyword map in `preFilter.ts`, system prompt in `api/curate.ts`.
- Step 6 (review screen + playlist creation) needs `playlist-modify-public` scope added to Spotify app
  if the public toggle is to work — currently only `playlist-modify-private` is requested.
