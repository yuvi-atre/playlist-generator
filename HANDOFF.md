# HANDOFF.md — Running State

The PRD is the static spec. This file tracks live build progress. Update it as you go.

## Status
**Phase:** Steps 1–7 complete. Full flow verified end-to-end locally (2026-06-30): vibe → curated
playlist → real playlist saved to Spotify with all tracks. Ready to redeploy.

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

## Session 2026-06-30 — fixes landed
- **Last.fm genre enrichment** (`src/lib/lastfm.ts`): Spotify `/v1/artists` 403s, so genres are
  backfilled from Last.fm top-tags (cached in localStorage). `VITE_LASTFM_API_KEY` env var.
  Wired into `useCurate` before the `/api/curate` call.
- **Curation hardened** (`api/curate.ts`): model → `claude-sonnet-5` with **structured outputs**
  (`output_config.format` JSON schema) so Claude returns strict JSON — no prose, no markdown fences.
  Was `claude-sonnet-4-6` + 2048 tokens, which rambled/truncated → 500s. Now 8192 tokens,
  `thinking: disabled`, `stop_reason` guards, and hallucinated IDs filtered against the candidate set.
- **OAuth callback fixes:** Vite bound to `127.0.0.1` (`vite.config.ts`) so the `127.0.0.1/callback`
  redirect resolves (was IPv6-only `localhost`); `show_dialog: 'true'` on auth; module-level guard in
  `CallbackHandler` to stop React StrictMode double-exchanging the single-use code (was a 400).
- **Spotify Feb 2026 API migration** (the big one — root cause of the persistent 403s):
  - `POST /users/{id}/playlists` was removed for Dev Mode apps → now `POST /me/playlists`.
  - `POST /playlists/{id}/tracks` renamed → `POST /playlists/{id}/items`.
  - Also required: add the login account's **email** under Spotify dashboard → User Management.
- Error bodies now logged on failed Spotify GET/POST (`apiGetUrl`/`apiPost`).

## Next step
- Redeploy to Vercel (frontend changes + `api/curate.ts`). Confirm `VITE_LASTFM_API_KEY` is set in
  Vercel env alongside the existing vars.
- Optional polish still open from Step 7: 429 backoff messaging on Spotify fetch, empty-curate copy.

## Decisions log
- Two-stage curation (code pre-filter → Claude pass). [PRD §8]
- Vercel serverless backend holds the Anthropic key. [PRD §9]
- Model A: single shared key + Console spend cap. [PRD §9]
- Claude Sonnet (`claude-sonnet-5`) for curation, with structured outputs for strict JSON. [PRD §9]
- Playlists private by default. [PRD §6]
- Tailwind v4 (Vite plugin, no config file). @tailwindcss/vite.
- Linting: oxlint (template default) + Prettier.
- Library cache TTL: 24h. Manual refresh button always available.
- `getAccessToken()` uses a ref internally — stable identity, safe as hook dep.
- `vercel dev` incompatible with Vite 8 — local dev uses `npm run dev` + `npm run dev:api` instead.

## Known Issues
- **`dev:api` does NOT hot-reload:** `npm run dev:api` caches the imported `api/curate.ts` in Node's
  ESM module cache. After editing `api/curate.ts` you MUST restart `dev:api`, or you'll test stale code.
  (Cost us a long debugging loop — the code was right, the running server wasn't.)
- **Spotify `/v1/artists` still 403s:** genre backfill now comes from Last.fm instead. The Spotify
  endpoint needs Extended Quota Mode (not requested; not needed).
- **Spotify Dev Mode:** the login account's email must be added under dashboard → User Management
  (max 5 users) or all API calls 403.
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
