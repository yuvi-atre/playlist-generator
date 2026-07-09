# HANDOFF.md — Running State

The PRD is the static spec. This file tracks live build progress. Update it as you go.

## Status

**Phase:** Steps 1–7 complete + perf/UX + branding overhaul + v2 curation features (filters, genre
normalization, Haiku vibe-expansion) + **intelligence-layer v2** (two-pass candidate select, artist-boost
fix, canonical genre scoring, expansion v2 with moods/energy/avoidGenres, curation prompt v2 with
playlistName/curatorNote, review-screen track removal). Full flow verified end-to-end: vibe → curated
playlist → real playlist saved to Spotify. **Deployed to prod** (live on
https://playlist-generator-theta-one.vercel.app via `npx vercel --prod --yes`). Latest commit: `9ba47d4`
(intelligence-layer v2, 2026-07-01) — pushed to GitHub, deployed, and BOTH prod endpoints runtime-verified
(`/api/expand-vibe` and `/api/curate` v2 responses confirmed live).

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

## Session 2026-06-30 (cont.) — perf + UX + polish

- **Perf:** `fetchAllLikedSongs` now fetches pages in parallel (concurrency 5) by offset using the
  first page's `total`, instead of chaining `next` serially (~17 serial reqs → ~4 rounds for ~800
  tracks; order preserved, 429 backoff intact). Last.fm enrichment concurrency 5 → 15. `trackMap`
  in `CurateResult` memoized. Bundle confirmed lean (~68 KB gzip before GSAP).
- **Loading UX:** `useCurate` exposes a `phase` ('matching' | 'enriching' | 'curating'); indeterminate
  progress bar (`LoadingBar` + `indeterminate-slide` keyframe in `index.css`) shown during curation
  and save, with step captions. NOTE: LLM curation is inherently ~3–6s — this is perceived-perf, not a
  real speedup. A true % bar is meaningless for an LLM call, so the bar is indeterminate on purpose.
- **Animation:** added **GSAP** (`gsap` + `@gsap/react`, ~28 KB gzip → bundle ~97 KB). Curated result
  cards stagger in via `useGSAP` (scoped, auto-cleanup, guarded by `prefers-reduced-motion`).
- **design.md** created at repo root — the visual system (color/type/spacing/shape tokens, motion
  rules incl. GSAP conventions, component patterns). Read it before adding UI.

## Session 2026-06-30 (branding + visual overhaul)

All committed (`d6c3f20` and prior) and deployed. Order of work:

- **Brand assets** (`public/`): robot `favicon.svg` (replaced the leftover purple scaffold logo),
  `og-image.png` (1200×630 social card). `index.html` got a real `<title>`, description, and full
  Open Graph + Twitter meta. OG banner is **social-share only** (user's call) — not shown in-app;
  verified live (`200 image/png`, tags served). Deleted unused `src/assets/hero.png`.
- **Animated robot mascots** — `src/components/RobotMascot.tsx` exports `RobotHero` (login + Get
  Started landing) and `RobotTyping` (fades into the vibe search bar on focus/typing/curating).
  IMPORTANT: robots are **inline SVG JSX with animation in `index.css`**, NOT `.svg` files. The
  user's editor has an on-save SVG optimizer that strips `<style>`/animation attrs from `.svg` files;
  inline JSX + app CSS is immune. Keyframes: `robot-eq` (equalizer bars), `robot-note` (antenna+note
  bob straight up/down as one unit — no rotation, no gap). Don't reintroduce animated `.svg` files.
- **Get Started landing flow** — after login + library load, `GetStartedHero` shows (robot + title +
  track count + CTA). Click swipes hero up/out via GSAP, then `LibraryStats` slides up in. Post-login
  only (OAuth redirect would interrupt a pre-login swipe). `started` state in `LibraryScreen`.
- **Album art** — added `albumArt` to `Track` (comes FREE in the `/me/tracks` payload — smallest of
  `album.images`; NO extra API call, curation still uses name+artist+genre+year only). Rendered via
  `AlbumArt` sub-component (lazy, opacity+scale reveal, equalizer-glyph fallback) in curated cards +
  library rows. **Cache key bumped `pg_library` → `pg_library_v2`** so art-less caches re-fetch once.
- **Genre tags + count** — on the review screen only. Reuses the Last.fm genres already fetched per
  candidate in `useCurate` (previously discarded); now kept in `genresByTrack: Map<id,string[]>` and
  shown as up-to-3 pills per card + "spanning N genres" in the summary. **Zero extra requests.** User
  explicitly declined full-library genre enrichment (would be ~617 Last.fm calls / throttling risk).
- **Two-column layout** — `LibraryStats` and `CurateResult` are now `lg:grid-cols-[19rem_1fr]`:
  sticky controls/summary left, **bounded scroll pane right** (`max-h-[70vh]` / `calc(100vh-…)` with
  `.custom-scrollbar`). Fixes endless page scroll. Collapses to single column below `lg`.
- **Motion → Impeccable spec** (friend's ref: github.com/pbakaus/impeccable). Easing `ease-out-quart`
  `cubic-bezier(0.165,0.84,0.44,1)` (const `EASE_QUART` in LibraryScreen; GSAP `expo.out`), entrances
  200–300ms, subtle Y, **transform+opacity only**, `prefers-reduced-motion` guards everywhere. See
  design.md. Other friend refs: codrops (animation inspo), higgsfield (AI video/image gen — for a
  promo later, not UI).

## Session 2026-07-01 — BrandBanner + upscale + real genre count

All committed (`ce47460`) and deployed.

- **BrandBanner** (Claude-design component in `LibraryScreen.tsx`): robot + "Playlist Generator"
  wordmark + live equalizer (HTML divs using the `robot-eq` class). Anchors the bottom of the library
  workspace's left column.
- **Upscaled the library-ready area:** left column `19rem → 24rem` (`max-w-6xl`, `gap-10`), vibe input
  - Generate button enlarged to `py-4 text-base`.
- **Genre count is now real on the library screen.** `LibraryScreen` runs a BACKGROUND full-library
  Last.fm enrich (`fetchArtistGenres` over all unique first-artists) in a `useEffect` after render —
  non-blocking, cached; `uniqueGenres` derives from that map so the "genres" stat fills in a few
  seconds after load. User had declined this for perf; backgrounding it resolved the concern. First
  load ≈ 617 Last.fm calls (concurrency 15, failures cache as []); lower `CONCURRENCY` in `lastfm.ts`
  if throttled.

## Session 2026-07-01 (cont.) — share button + search roadmap

- **Share button** on the saved screen (`CurateResult`): Web Share API (native sheet on mobile →
  iMessage/AirDrop) with a clipboard-copy fallback on desktop. Spotify links already unfurl rich
  previews, so the link is the share.
- **Cost profile confirmed:** ~2–3¢/playlist on Sonnet 5 (intro $2/$10). Keep the Console spend cap.
  Rejected a native iMessage app ($99/yr + review, overkill). See the `project_roadmap` memory.
- **Search-optimization roadmap** logged (`preFilter.ts`): #1 genre-aware filter DONE; #2 vibe→genre
  coverage (dictionary or Haiku expansion); **#3 scoring balance + #4 artist diversity (chosen next,
  free/local)**; #5 candidate count. Full detail in the `project_roadmap` memory.

## Session 2026-07-01 (cont.) — search/playlist filters + genre normalization

Committed to `main` (`53be24d`, `5a2cd85`); DEPLOYED to prod (see later session).

- **Filters** (`src/lib/types.ts` `CurateFilters`, `preFilter.ts`, `useCurate.ts`, `LibraryScreen.tsx`
  `FiltersPanel`): include/exclude genres, include/exclude artists, decade gate, playlist length.
  HARD gates applied in preFilter BEFORE scoring (AND across dims, OR within); vibe ranks the survivors.
  Include-artist is cap-exempt + boosted (adaptive `MAX_PER_ARTIST` resolution). Length → target band
  in `api/curate.ts` (short ~15 / medium ~25 / long ~45) with an explicit "don't pad" instruction.
  Collapsible panel, internally scrollable; genre chips show +/− state; empty-pool has its own message.
- **Genre normalization** (`src/lib/genres.ts`, read-time — no re-fetch needed): collapses Last.fm
  variants (hiphop/hip-hop→hip hop, whole rnb family→r&b, lofi→lo-fi, jpop→j-pop, ost→soundtrack) and
  drops non-genres (geography, artist names, sentiment/meta/franchise junk, decades/years). Feeds the
  stat, chips, and include/exclude matching; deliberately NOT wired into the tuned vibe-scoring path.
  `LibraryScreen` applies `MIN_GENRE_ARTISTS=2` to stat + chips. Tuned against a real dump: ~300 → ~50.
- **Polish:** result-list GSAP stagger capped to first 12 cards + `clearProps` (long lists were fading
  to an unreadable dark gradient); result cards made opaque (`bg-zinc-900`).
- **DECIDED:** genre stat = "meaningful genres (≥2 artists)"; vibe→genre fix = **Haiku vibe-expansion
  pass** (NOT started — next session). Note: `localhost` vs `127.0.0.1` split the OAuth `sessionStorage`
  and caused "State mismatch — CSRF"; do the whole dev flow on **127.0.0.1:5173** (matches redirect URI).

## Session 2026-07-01 (cont.) — Haiku vibe-expansion + deploy + layout/mascot

All committed to `main` and DEPLOYED to prod (`0db9163` live; `git push origin main` also done).

- **Haiku vibe-expansion (DONE, `6056e1e`):** `api/expand-vibe.ts` POST `{ vibe }` → `{ genres, decades }`
  via `claude-haiku-4-5-20251001` (structured JSON, mirrors curate.ts params; ~$0.0003/call). `useCurate`
  runs it FIRST (new `expanding` phase), caches per-vibe in localStorage (`pg_vibe_expansion`), and is
  fully NON-FATAL (failure → null → old dictionary behavior). `preFilter(library, vibe, filters, expansion)`
  merges the hints into `genreKeywords`/`eraRanges`. `scripts/dev-api.ts` now routes by path so both
  endpoints work locally. ⚠️ Not runtime-verified that Haiku accepts the structured-output params — if it
  rejects them the endpoint 500s and curation silently degrades; check Vercel function logs on an
  off-dictionary vibe. `dev:api` needs a restart to pick up the new endpoint (no hot-reload).
- **Deployed to prod** via `npx vercel --prod --yes` (all env vars incl. `ANTHROPIC_API_KEY` already set;
  new function deploys automatically). Prod OAuth uses the vercel URL, so no localhost/127 issue there.
- **Layout fix (`03c40bb`):** filters sat between the vibe input and Generate with BrandBanner last, so
  expanding filters pushed both off-screen. Reordered left column → BrandBanner top, Generate under the
  input, Filters last. Widened to `max-w-7xl` / `26rem` left col / `gap-12`.
- **Filters cap + CuratedVisualizer (`0db9163`):** panel cap tightened to `min(30rem,calc(100vh-26rem))`
  so it scrolls internally and the left column stays viewport-bounded (don't lengthen the song list to
  match — cap the tall element). Integrated the Claude-design **`CuratedVisualizer`** (`RobotMascot.tsx`):
  hero mascot + floating notes + wide visualizer row, in the space below Save-to-Spotify on the review
  screen. New `float-note`/`viz-bar` keyframes in `index.css` (reduced-motion guarded). NOTE: the 3 design
  files were dropped at repo ROOT built on a PRE-filters base — diffed out only the new bits; deleted the
  root copies. Future design drops: base them on current deployed state to avoid stale diffs.
- **oxlint schema fix (`c10a352`):** `.oxlintrc.json` `$schema` → unpkg URL (the relative node_modules
  path failed under VSCode's `git:` scheme in diff views).

## Session 2026-07-01 (cont.) — intelligence-layer v2 (curation quality overhaul)

User report: curation "hasn't been going well." Root-caused three pipeline defects and rebuilt the
intelligence layer around them. Committed to `main` and DEPLOYED to prod (`npx vercel --prod --yes`)
at session end — see the Status block for the live commit.

- **Bug 1 — cold-start genre gap (the big one):** `preFilter` scored on `track.genres`, but Last.fm
  enrichment ran AFTER pre-filtering — on a cold cache every track scored 0 on genre and the candidate
  set was basically popularity + jitter. **Fix: two-pass select in `useCurate`** — pass 1 takes a wide
  shortlist (`SHORTLIST_SIZE = 300`, exported from `preFilter.ts`), its artists get Last.fm-enriched,
  then pass 2 re-runs `preFilter` on the enriched shortlist and cuts to the final 150.
  (`preFilter` gained an optional `limit` param.)
- **Bug 2 — common-word artist boost:** vibe tokens ≥3 chars substring-matched artist names, so
  "late **night** drive" gave every artist with "night" in the name +5/token, +8 boost, AND exemption
  from the per-artist cap → one wrong artist flooded the playlist. **Fix:** artist mention now requires
  the FULL artist name in the vibe at word boundaries (`vibeNamesArtist`); the separate
  `ARTIST_NAME_SCORE` token signal was removed (the boost covers it); boost matching is exact-name for
  vibe mentions (so "Drake" doesn't boost "Drake Bell") and substring only for user-typed include filters.
- **Bug 3 — canonicalization missing from scoring:** track tags are now canonicalized in `scoreTrack`
  (raw "rnb"/"lofi" tags now match "r&b"/"lo-fi" hints). Expansion keywords also canonicalized.
- **Vibe expansion v2 (`api/expand-vibe.ts`):** Haiku now returns `{ summary, genres, avoidGenres,
moods, energy, decades }`. `avoidGenres` scores as a soft penalty (`AVOID_GENRE_PENALTY = 4`) in
  `preFilter`; wanted-genres win ties. Decades hint discarded when Haiku lists >3 decades (genre
  association noise, verified live: "rainy Tokyo rooftop" → 4 decades). Expansion cache key bumped
  `pg_vibe_expansion` → `pg_vibe_expansion_v2`. ✅ Runtime-verified live (Haiku + structured outputs OK).
- **Curation prompt v2 (`api/curate.ts`):** selection principles (mood/energy fit over genre match,
  cohesion over popularity, no duplicate versions of a song), ordering principles (strong open, energy
  arc per vibe, memorable close), and the Haiku interpretation (summary/moods/energy) forwarded from the
  client via `CurateRequest.interpretation`. Response now includes **`playlistName`** (prefills the save
  input) and **`curatorNote`** (shown on the review screen). Server-side candidate cap
  (`MAX_ACCEPTED_CANDIDATES = 200`) protects spend. ✅ Runtime-verified live with a synthetic candidate
  set: rejected off-vibe plants (polka/hardstyle), returned 7 instead of padding to 15, good name + note.
- **Review-screen capabilities (`LibraryScreen.tsx` `CurateResult`):** per-track **remove/restore** (×/↺,
  hover-revealed on lg+, always visible below; removed cards dim + strike-through; header count, genre
  count, and Save all track the kept set; Save shows `(N)` and disables at 0; buttons hidden post-save),
  Claude-suggested playlist name prefill, curator-note callout, genre pills + genre count now canonicalized.
- **Housekeeping:** `scripts/dev-api.ts` port now overridable via `API_PORT` env var; repo-wide
  `prettier --write` (baseline was dirty — `npm run lint` now actually passes); App.tsx exhaustive-deps
  warning fixed (destructure stable `load`); memoized `uniqueArtists`.
- **Follow-up (user feedback, same day):** typed "anime night" → save input prefilled "…marathon"
  (Claude's `playlistName`). **DECIDED: the intelligence layer never edits user-facing text on its
  own.** The name input now prefills with the RAW vibe; Claude's title shows as an opt-in
  "Suggestion: …— tap to use" chip below it (hidden once applied/matching), and the curator note got
  an explicit "Curator's note" label. Committed + deployed.
- **Playlist covers (user report: iMessage preview showed a blank Safari icon):** fresh API playlists
  have NO cover, so link unfurls were blank. Now `handleSave` generates a cover client-side
  (`src/lib/cover.ts`: 2×2 album-art mosaic from the kept tracks; 1–3 images → full-bleed; none →
  branded zinc-gradient + green equalizer + title fallback; canvas → base64 JPEG stepped under the
  256 KB cap) and uploads it via `uploadPlaylistCover` (`PUT /playlists/{id}/images`, raw base64 body,
  Content-Type image/jpeg). Verified: `i.scdn.co` serves `access-control-allow-origin: *`, so
  `crossOrigin='anonymous'` keeps the canvas untainted. **Supporting changes:** `Track.albumArtLarge`
  (~300px, second-smallest image — the 64px thumbs were too blurry for a 640px cover) → **library
  cache key bumped `pg_library_v2` → `pg_library_v3`** (one-time auto refetch); **scope added:
  `ugc-image-upload`** — pre-existing tokens lack it, so the upload is NON-FATAL (401/403 → subtle
  "log out and back in to enable covers" notice via `coverNotice`; other failures silent). ⚠️ Users
  must re-login ONCE to grant the scope before covers upload.
- **Full audit pass (same session):** robustness + QoL fixes, all runtime-verified locally.
  - `apiPost` gained the same 429 Retry-After backoff as `apiGetUrl` (playlist save no longer hard-fails
    on a rate-limit window).
  - **Token-refresh race fixed** (`useSpotifyAuth`): concurrent `getAccessToken()` callers now share one
    in-flight refresh promise — Spotify rotates refresh tokens, so parallel refreshes could 400 the loser
    and force-log the user out.
  - **API endpoints hardened** (`src/lib/serverGuard.ts`, both `api/*.ts`): browser requests from
    unrecognized Origins → 403 (hotlink deterrent, NOT auth — spend cap is the backstop; no-Origin
    curl/server calls pass). Vibe capped at 300 chars server-side / 200 on the input; candidates coerced
    to exact shape (malformed items dropped, all-invalid → 400, no more 500s from garbage);
    `interpretation` fields type-guarded. Verified: evil origin 403s, prod/localhost origins pass,
    all-invalid candidates 400 without an Anthropic call.
  - **QoL:** Enter now saves (name input wrapped in a form; save button `type="submit"`); expansion
    cache capped at 40 entries (oldest evicted); library rows use `content-visibility: auto`
    (`.lib-row`, `contain-intrinsic-size: 52px`) so the full no-pagination list only pays for visible
    rows; playlist-name input got `maxLength` + aria-label.
- ⚠️ **Worktree note:** this session ran in a git worktree without `.env` — local API testing used
  `npx tsx --env-file="<main repo>/.env" scripts/dev-api.ts` with `API_PORT=3111`. Also killed a STALE
  `dev:api` that was squatting port 3001 with pre-expand-vibe code — restart `npm run dev:api` fresh.

## Next step (older open ideas, none started)

- **Search filtering #3 + #4** — DONE (`preFilter.ts`, knobs are named constants). Live `111fdbd`.
- **v2 curation features (validated 2026-07-01, not started; full detail in `project_roadmap` memory):**
  1. **Artist-focused playlists.** ⚠️ Conflicts with the `MAX_PER_ARTIST=3` diversity cap — reconcile
     via an ADAPTIVE cap: when the vibe names a library artist (preFilter already +5s it), exempt that
     artist from the cap and boost. DECIDE THIS FIRST before building 1 or 3.
  2. **Playlist length range (no forced padding).** Prompt change in `api/curate.ts` — pass a target
     range to Claude, instruct "return fewer if fewer genuinely fit; do not pad." Quality > quantity.
  3. **Include/exclude genres + artists.** Do it in `preFilter` (free/local). This is CLAUDE.md's
     deferred-to-v2 genre filter — now unblocked by the `libGenres` background enrichment. Overlaps #1.
  - Also still queued: **#2 vibe→genre coverage** (dictionary or Haiku expansion for off-dictionary vibes).
- **2×2 album-art cover mosaic** on the review screen + **animated save-success** (checkmark draw +
  confetti-lite) — user selected album-art/cards this session but skipped these two; easy next win.
- **Library-ready screen entrance** (stats/title fade-up) — same GSAP pattern as the results stagger.
- **Album-art thumbnails** in track rows (lazy-loaded, fixed size) — biggest list upgrade.
- **Empty/error states** with more character than plain text.
- **Public access:** app is in Spotify Development Mode (max 5 allowlisted users). To let anyone use it,
  request **Extended Quota Mode** in the Spotify dashboard (needs a privacy policy page, app branding).
- Optional Step-7 polish: 429 backoff messaging on Spotify fetch, friendlier empty-curate copy.
- Optional: promo video via Higgsfield (asset generator, not UI code) for sharing the project.

## Open questions

- "impeccable" — a friend's recommendation we couldn't identify (studio? template? font?). Need a link.

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

## Vercel env vars (production) — all set (verified via `vercel env ls production`)

- `VITE_SPOTIFY_CLIENT_ID` — set
- `VITE_SPOTIFY_REDIRECT_URI` — set to https://playlist-generator-theta-one.vercel.app/callback
- `ANTHROPIC_API_KEY` — set (rotate in Anthropic Console if exposed)
- `VITE_LASTFM_API_KEY` — set (Preview + Production)

## Redeploy

- `npx vercel --prod --yes` from the repo (CLI authed as `yuvi-atre`, project linked via `.vercel/`).
- `git push origin main` also updates the GitHub remote. A transient "Not authorized" on deploy just
  needs a retry.
