# CLAUDE.md — Project Instructions

This file is auto-read by Claude Code. The full spec lives in `PRD.md` — read it first.

## What this is
A web app that generates Spotify playlists from the user's liked songs via a vibe prompt
("Minecraft with the boys" → curated playlist). Conversational input, two-stage curation,
real playlist created in the user's Spotify account.

## Stack
- React + Vite + TypeScript + Tailwind (frontend)
- Vercel serverless function (backend — holds the Anthropic key)
- Spotify Web API (OAuth: Authorization Code + PKCE)
- Anthropic API, Claude Sonnet (curation)

## Commands
- `npm run dev` — local dev server (port 5173)
- `npm run build` — production build
- `npm run lint` — lint (set up ESLint + Prettier early)

## CRITICAL security rules (do not violate)
- The Anthropic API key is **backend-only**. It is read ONLY inside the Vercel serverless
  function. NEVER expose it to the frontend, never prefix it with `VITE_`, never log it.
- In Vite, any env var prefixed `VITE_` is bundled into client-side code and publicly visible.
  So: Spotify Client ID → `VITE_` prefix is fine (it's public by design in PKCE).
  Anthropic key → NO `VITE_` prefix, server-side only.
- `.env` is gitignored. Never commit secrets. Never paste them into code as literals.
- All Claude API calls go through the serverless function as a proxy — the frontend calls
  our own `/api/curate` endpoint, which calls Anthropic. The browser never calls Anthropic directly.

## Architecture rules
- Curation is TWO-STAGE (see PRD §8):
  1. Local code pre-filter: vibe prompt → ~150 candidate tracks (no LLM).
  2. Claude curation pass: send only candidates, get back structured JSON (track IDs + reasons).
- Never send the full library to Claude. Pre-filter first.
- Claude must return STRICT JSON only (no prose, no markdown fences). Parse defensively.
- Cache the fetched library in localStorage; provide a manual "refresh library" button.

## Conventions
- TypeScript strict mode on. Type the Spotify and Claude response shapes explicitly.
- Keep components small. Co-locate types near usage.
- Handle the failure cases in PRD FR8: token expiry, empty results, 429 rate limits, API errors.
- Playlists default to PRIVATE; expose a public toggle on the review screen.

## What NOT to do
- Don't add audio-features / recommendations / related-artists calls — those endpoints are
  deprecated and will 403 for this app. Curation uses name + artist + genre + year only.
- Don't add user bring-your-own-key in v1. Single shared key, Model A.
- Don't build manual genre/decade filter UI in v1 (deferred to v2).