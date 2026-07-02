# PRD — Spotify Playlist Generator

**Owner:** Yuvi
**Status:** Spec locked — build-ready
**Last updated:** June 2026

---

## 1. Problem

My Spotify liked-songs library is a graveyard — hundreds of tracks with no organization. Spotify's own tools make me build playlists manually, song by song. There's no way to say "give me something for Minecraft with the boys" and get a curated set pulled from _my own_ library.

## 2. Goal

Conversational playlist generation from a user's liked songs. Prompt a chatbot with a vibe → get a real Spotify playlist created in the account, curated from music the user already likes.

## 3. Non-goals (v1)

- No music discovery / recommendations outside the user's own library (also blocked by deprecated Spotify endpoints).
- No collaborative or social features.
- No mobile-native app (web only for v1).
- No bring-your-own-key for end users (see §9 — single shared key in v1).
- No manual filter controls (genre/decade sliders) — deferred to v2.

## 4. Target user

- **Primary:** Me (dogfood first).
- **Secondary:** People I demo it to / portfolio reviewers.

## 5. Core user flow

1. Log in with Spotify.
2. App pulls and displays liked songs (cached locally after first pull).
3. User types a vibe prompt ("late-night coding," "Minecraft with the boys," "gym but sad").
4. System pre-filters the library to a candidate set, then Claude curates the final tracklist, each with a one-line reason.
5. User reviews, tweaks (remove tracks, regenerate, rename), and confirms.
6. Playlist is created in the user's Spotify account (private by default).

## 6. Functional requirements

| ID  | Requirement                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1 | Spotify OAuth (Authorization Code + PKCE), scopes `user-library-read` and `playlist-modify-private`.                                               |
| FR2 | Fetch all liked songs (paginate `/me/tracks`, 50/page), enrich with artist genres.                                                                 |
| FR3 | Cache the library in localStorage; manual "refresh library" button to re-pull.                                                                     |
| FR4 | Chat interface that takes a vibe prompt.                                                                                                           |
| FR5 | Two-stage curation: (a) code pre-filter to ~150 candidates, (b) Claude curation pass returning structured JSON (track IDs + one-line reason each). |
| FR6 | Review screen — remove tracks, regenerate, rename playlist, toggle public/private.                                                                 |
| FR7 | Create playlist + add selected tracks via the API.                                                                                                 |
| FR8 | Handle failure cases — token expiry, empty results, rate limits, API errors.                                                                       |

## 7. Constraints & risks

- **No audio features.** Spotify deprecated audio-features, recommendations, and related-artists in Nov 2024. Energy/valence/tempo are gone. **Central design bet:** curation runs on track name + artist + genre + release year + Claude's world knowledge. Validated as sufficient for vibe-based curation (which is what the product is about).
- **Library size → token budget.** Solved via two-stage curation (§8) — never send the whole library to Claude.
- **Rate limits** on the Spotify API during the initial library pull — paginate and handle 429s.
- **Cost exposure** from shared key — bounded by a hard Console spend cap (§9).

## 8. Curation design (the core product work)

**Two-stage pipeline:**

1. **Stage 1 — code pre-filter (cheap, fast, no LLM).** From the vibe prompt, infer relevant genres / eras / keywords and filter the cached library from ~1000 tracks down to ~150 candidates. Pure local logic.
2. **Stage 2 — LLM curation (focused, smart).** Send only the candidate set (track ID, name, artist, genres, year) + the vibe prompt to Claude. Claude returns structured JSON: a list of ~25 track IDs, each with a one-line reason. Parse, map IDs back to tracks, render the review screen.

**Why two-stage:** keeps every Claude call lean (cheap + fast) and gives Claude a focused candidate set, which produces better picks than scanning everything.

**Enrichment signals available (replacing audio features):** artist genres (primary), track + album name, release year (era filtering), artist popularity (hits vs deep cuts).

**Deferred to v2:** one-time mood-tagging enrichment pass (cache vibe labels per track), manual filter controls.

## 9. Architecture

- **Frontend:** React + Vite + TypeScript + Tailwind.
- **Auth:** Spotify OAuth — Authorization Code + PKCE (client-side, no client secret needed).
- **Backend:** Vercel serverless function. Holds the Anthropic API key and relays curation calls to Claude. **The frontend never sees the Anthropic key.**
- **AI layer:** Anthropic API (Claude **Sonnet** for curation quality; Haiku as a cost-down option if needed). Prompt → structured JSON → render. Same pattern as the Battle Advisor.
- **Key strategy:** **Model A** — one shared key (mine), held in the serverless backend. End users just log in with Spotify; they never touch an API key. Protected by a **hard spend cap set in the Anthropic Console** so a bug or curious user can't run up a bill.

### Key & secret handling

- Anthropic API key comes from the **Anthropic Console** (`console.anthropic.com`) — separate product/billing from any Claude.ai subscription. Subscription credits do NOT fund the API.
- Local dev: key in a **gitignored `.env`**, read only by the serverless function.
- Production: key in **Vercel environment variables**, never in the bundle.
- Never commit, screenshot, or paste the key. Rotate immediately if leaked.

## 10. Data model (core object)

```
Track {
  id, name, artist[], album,
  genres[],        // from the artist endpoint
  year,            // from album release date
  popularity,      // artist or track popularity
  addedAt
}
```

No audio features, so the model stays lean.

## 11. Spotify app config (locked)

- **App name:** (your choice — shows on consent screen)
- **APIs:** Web API only (no Web Playback SDK / iOS / Android / Ads)
- **Redirect URI (dev):** `http://127.0.0.1:5173/callback` ← use the IP form, not `localhost`; must match code exactly
- **Redirect URI (prod):** add the Vercel URL when deployed
- **Scopes:** `user-library-read`, `playlist-modify-private`
- **Client ID:** from app Settings → goes in frontend config
- **Client secret:** not needed (PKCE)

## 12. Success metric

I use it instead of hand-building playlists. Concretely: thumbs-up rate on generated playlists, and % of tracks kept without heavy editing.

## 13. Build order

1. Scaffold React + Vite + TS + Tailwind.
2. Spotify OAuth (PKCE) + liked-songs fetch + localStorage cache. **(No API cost — build this first.)**
3. Vercel serverless function + Anthropic key wiring + Console spend cap.
4. Stage-1 pre-filter logic.
5. Stage-2 Claude curation prompt — iterate on pick quality (the real product work).
6. Review screen + playlist creation.
7. Error handling pass (FR8).
8. Deploy to Vercel, add prod redirect URI.

## 14. Open decisions

_None — all resolved. Decisions locked in §3, §6, §8, §9, §11._
