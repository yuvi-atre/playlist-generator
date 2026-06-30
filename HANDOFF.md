# HANDOFF.md — Running State

The PRD is the static spec. This file tracks live build progress. Update it as you go.

## Status
**Phase:** Steps 1–6 complete. App is live and functional. Step 7 (error handling pass) is next.

## Live URL
https://playlist-generator-theta-one.vercel.app

## Done
- Spotify Developer app created (Client ID obtained, redirect URI set).
- Anthropic Console account + API key created.
- Spec locked (see PRD.md).
- **Step 1 — scaffold:** React 19 + Vite 8 + TypeScript 6 (strict) + Tailwind v4 + Prettier + oxlint.
- **Step 2 — Spotify OAuth + library:**
  - `src/lib/pkce.ts` — PKCE helpers.
  - `src/lib/config.ts` — centralised env vars.
  - `src/lib/storage.ts` — typed localStorage helpers.
  - `src/lib/spotify.ts` — full Spotify API client: PKCE auth, token exchange/refresh, user fetch,
    paginated liked-songs fetch (with 429 backoff), artist batch genre enrichment, playlist creation.
  - `src/hooks/useSpotifyAuth.ts` — PKCE login, token auto-refresh, logout.
  - `src/hooks/useLibrary.ts` — paginated fetch + artist enrichment (non-fatal 403) + 24h cache.
  - `src/components/LoginScreen.tsx` — Spotify-branded login button.
  - `src/components/CallbackHandler.tsx` — OAuth callback: state verification + code exchange.
  - `src/components/LibraryScreen.tsx` — full UI: stats, song browser (search + paginated list),
    vibe input form, curate result list with Save to Spotify.
  - `src/App.tsx` — routes /callback, login gate, auto-loads library on auth.
- **Step 3 — Vercel serverless function + Anthropic key:**
  - `api/curate.ts` — POST { vibe, candidates } → Claude Sonnet → `{ tracks: [{ id, reason }] }`.
    Validates input, formats candidates, returns strict JSON. Handles 429, API errors, and strips
    markdown fences from Claude response defensively.
  - `vercel.json` — SPA rewrite (extension-less routes → index.html only).
  - `@anthropic-ai/sdk` + `@vercel/node` + `vercel` added.
- **Step 4 — pre-filter + useCurate:**
  - `src/lib/preFilter.ts` — tokenises vibe, expands via keyword→genre map, detects era ranges,
    scores tracks, returns top 150 candidates.
  - `src/hooks/useCurate.ts` — chains preFilter → POST /api/curate → stores result + vibe string.
- **Step 5 — curation quality:** Tested live. Claude returns valid JSON. Markdown-fence stripping
  added defensively. Genre data unavailable (Spotify /v1/artists 403s — see Known Issues).
- **Step 6 — review screen + playlist creation:**
  - `CurateResult` in LibraryScreen has name input (pre-filled with vibe) + Save to Spotify button.
  - Creates private playlist via `createPlaylist` + `addTracksToPlaylist`, shows Open in Spotify link.
  - `useCurate` exposes `vibe` so CurateResult can default the playlist name.

## In progress
- (nothing)

## Next step
- **Step 7 — error handling pass:**
  - Token expiry mid-flow (force re-login).
  - Empty curate results (better messaging).
  - 429 rate limits on Spotify fetch.
  - API errors surfaced clearly on Save to Spotify.
  - Consider: what happens if `createPlaylist` succeeds but `addTracksToPlaylist` fails?

## Decisions log
- Two-stage curation (code pre-filter → Claude pass). [PRD §8]
- Vercel serverless backend holds the Anthropic key. [PRD §9]
- Model A: single shared key + Console spend cap. [PRD §9]
- Claude Sonnet (`claude-sonnet-4-6`) for curation. [PRD §9]
- Playlists private by default. [PRD §6]
- Tailwind v4 (Vite plugin, no config file). @tailwindcss/vite.
- Linting: oxlint (template default) + Prettier.
- Library cache TTL: 24h. Manual refresh button always available.
- `getAccessToken()` uses a ref internally — stable identity, safe as hook dep.
- `vercel dev` incompatible with Vite 8 — local dev uses `npm run dev` + `npm run dev:api` instead.

## Known Issues
- **0 genres:** Spotify `/v1/artists` returns 403 for this app. Artist genre fetch is non-fatal
  (library loads, genres are empty). Pre-filter and Claude curation still work on name/artist/year.
  Fix: apply for Extended Quota Mode in the Spotify developer dashboard.
- **No public playlist toggle:** `playlist-modify-public` scope not requested. Adding it requires
  users to re-auth. Deferred to v2 per PRD.

## Blockers
- (none)

## Local dev setup
- Run with TWO terminals (vercel dev is incompatible with Vite 8):
  - Tab 1: `npm run dev:api` (local API server on port 3001, reads .env)
  - Tab 2: `npm run dev` (Vite on port 5173)
- Open http://localhost:5173
- Spotify redirect URI for local dev: `http://127.0.0.1:5173/callback` (must be in Spotify dashboard)

## Vercel env vars (production)
- `VITE_SPOTIFY_CLIENT_ID` — set
- `VITE_SPOTIFY_REDIRECT_URI` — set to https://playlist-generator-theta-one.vercel.app/callback
- `ANTHROPIC_API_KEY` — set (rotate in Anthropic Console if exposed)
