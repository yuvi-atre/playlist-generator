# Playlist Generator

Generates a real Spotify playlist from your liked songs by describing a vibe, using a two-stage AI curation pipeline over your own library.

**Try it:** https://playlist-generator-theta-one.vercel.app/ — click "try the demo" on the login screen for full curation on a sample library, no Spotify login required.

## The problem

A Spotify liked-songs library is usually a few hundred to a few thousand tracks with no organization, and Spotify's own tools require building playlists manually, track by track. There's no way to describe a mood ("Minecraft with the boys," "late-night coding") and get a curated set pulled from music you already like.

## Stack

- **React + Vite + TypeScript + Tailwind** — standard SPA stack, no server-rendering needed since the only backend logic is a couple of API calls.
- **Spotify OAuth via Authorization Code + PKCE** — avoids a client secret in the browser entirely, so the Spotify Client ID can be shipped in the frontend bundle safely.
- **Vercel serverless functions as a backend split** — the Anthropic API key never reaches the browser; the frontend calls `/api/curate`, `/api/expand-vibe`, and `/api/discover`, which hold the key server-side and proxy to Anthropic.
- **`@anthropic-ai/sdk`** — used directly against the Messages API with `output_config.format: json_schema` (structured outputs), so responses are enforced to a schema instead of parsed out of free-text/markdown.
- **Model routing (two models, two jobs)** — `claude-haiku-4-5-20251001` for vibe expansion (cheap, low-latency, feeds two other stages), `claude-sonnet-5` for curation and discovery (the judgment-heavy stages, worth the extra cost).

## How it works

**1. Vibe expansion (Haiku).** The raw prompt ("anime night") is sent to `/api/expand-vibe`, which returns a structured interpretation: a one-sentence summary, genres, genres to avoid, moods, an energy level, and decades if the vibe implies an era. This single Haiku call feeds two different downstream consumers — its genres/avoidGenres/decades become scoring signal for the local pre-filter, and its summary/moods/energy are forwarded verbatim into the Sonnet curation prompt, so both stages work from the same reading of the vibe instead of curation re-deriving it from scratch.

**2. Local pre-filter, no LLM.** `preFilter.ts` scores every track in the cached library against the vibe using genre matches (weighted higher when they come from Haiku's expansion than from a static keyword dictionary), era range, title keyword hits, and popularity, then narrows the library down to a candidate pool — up to 150 tracks, front-loaded with genuine on-vibe matches rather than padded with popular filler. A two-pass select handles the cold-start case: a wide 300-track shortlist gets its artist genres enriched first, then pre-filter re-runs on the enriched set to pick the final 150.

**3. Curation (Sonnet), candidates only.** `/api/curate` never sees the full library — only the pre-filtered candidate list, in relevance order, plus the vibe and the Haiku interpretation. This is a quality choice, not just a cost one: a focused, pre-ranked candidate set lets Sonnet reason about ordering, cohesion, and energy arc within a bounded set it can actually hold in context, rather than needle-in-a-haystack scanning a whole library. The response is schema-enforced JSON (`output_config.format`) — a title, a curator's note, and per-track one-line reasons — with any hallucinated track ID that isn't in the candidate set filtered out before it reaches the client.

**4. Discovery (Sonnet + Spotify Search verification), optional.** When the "Discover new music" toggle is on, `/api/discover` asks Sonnet to propose real songs — by name and artist, never by ID, since models hallucinate IDs — that fit the vibe and the listener's taste profile but aren't already in their library. Each proposal is then checked against Spotify's Search API using a server-held app token (Client Credentials, not the user's OAuth token — this is also what lets discovery work in demo mode, which has no user token at all). Verification requires an artist match and a fuzzy title match, rejects known non-studio versions (live, remix, cover, sped up, etc.), and drops anything already in the user's library; unverified proposals are silently discarded rather than shown. Verified discoveries append to the playlist with a `NEW` badge, on top of the curated count, not counted toward it.

## Cost and abuse guards

- Every serverless endpoint checks the request's `Origin` header against an allowlist (`src/lib/serverGuard.ts`) — prod, Vercel preview deploys, and localhost. Requests with no `Origin` header (curl, server-to-server) are allowed through. This is explicitly a hotlink deterrent, not authentication — it stops another website from embedding a fetch to these endpoints and burning Anthropic credit, not a determined attacker. The actual backstop is a hard spend cap set in the Anthropic Console.
- Hard server-side ceilings on every endpoint regardless of what the real UI sends: vibe text capped at 300 characters, `/api/curate` accepts at most 200 candidates, `/api/discover` caps taste-profile lists at 20 items and library-ID lists at 2000, and proposal counts are clamped to at most 15.
- Malformed input degrades instead of 500ing: candidates missing required fields are dropped rather than crashing the request, and an all-invalid candidate list 400s before an Anthropic call is ever made.
- Discovery is designed to fail open: a missing `SPOTIFY_CLIENT_SECRET`, a Claude error, or malformed JSON all return `200 { tracks: [] }` rather than an error, since discovery runs as an independent parallel request and must never block curation.
- The waitlist endpoint (`api/waitlist.ts`) has its own guards — an email regex, a 254-character cap, and a honeypot field that returns a fake success to bots without pinging the Discord webhook it posts to. See "Beta waitlist" below for the full picture.

## Beta waitlist

Spotify's Developer Dashboard caps this app's Development Mode at 5 allowlisted accounts — real Spotify login only works for whoever currently holds one of those 5 slots. Everyone else hits `WaitlistForm` (`src/components/LoginScreen.tsx`), which also appears at the bottom of the demo's review screen in place of Save-to-Spotify. Demo mode — full curation on a bundled sample library, no OAuth — is the no-account path, so the product is usable by anyone before or instead of joining the queue.

There's no database. `api/waitlist.ts` posts each signup straight to a Discord webhook (`DISCORD_WEBHOOK_URL`) as a message with the email and an ISO timestamp. The webhook channel is the datastore, and the timestamp is the rotation record — as a slot frees up, whoever signed up earliest in the channel gets manually added to the Spotify allowlist. There's no automated rotation.

Abuse handling, on top of the origin check shared with the other endpoints:

- a honeypot field (`website`) real users never see or fill; a bot that fills it gets a fake `200` back without a Discord post, so it has no signal to retry against.
- the email is checked against a simple regex and capped at 254 characters before use.
- the `@` in the email is stripped to `[at]` before posting to Discord, so a crafted address can't smuggle an `@everyone`/`@here` mention into the channel.
- if `DISCORD_WEBHOOK_URL` isn't set, the endpoint returns `503` and the form shows "not open yet" instead of erroring — the same fail-soft posture as the rest of the backend.

## Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `VITE_SPOTIFY_CLIENT_ID` — from your Spotify app dashboard. Safe to expose to the browser (PKCE, no client secret needed for login).
- `ANTHROPIC_API_KEY` — from the Anthropic Console. Backend-only: read exclusively inside the `api/` serverless functions, never prefixed `VITE_`, never bundled into client code.
- `VITE_SPOTIFY_REDIRECT_URI` — optional, defaults to `http://127.0.0.1:5173/callback`. Must exactly match the redirect URI registered in the Spotify dashboard.

Three more vars are optional — the app runs without them, with individual features degrading gracefully instead of erroring:

- `VITE_LASTFM_API_KEY` — genre enrichment (Spotify's own artist-genre endpoint 403s for this app). Get one at last.fm/api/account/create.
- `SPOTIFY_CLIENT_SECRET` — from the same Spotify app dashboard as the Client ID. Backend-only; powers the Client Credentials token that verifies Discovery-mode proposals via Spotify Search. Without it, Discovery silently returns no results.
- `DISCORD_WEBHOOK_URL` — where beta waitlist signups post (see "Beta waitlist" above). Without it, the waitlist form returns "not open yet."

Run two terminals (`vercel dev` isn't compatible with this Vite version):

```bash
npm run dev:api
```

```bash
npm run dev
```

Then open `http://127.0.0.1:5173` (not `localhost` — the OAuth redirect and PKCE session storage require the two to match exactly).

Other commands:

```bash
npm run build
npm run lint
```

## Repo map

- [`PRD.md`](PRD.md) — the full product spec: goals, functional requirements, curation design, architecture decisions.
- [`design.md`](design.md) — the visual system: color/type/spacing tokens, motion rules, component patterns.
- [`CLAUDE.md`](CLAUDE.md) — instructions for AI-assisted development on this repo: security rules, architecture rules, conventions.
- [`HANDOFF.md`](HANDOFF.md) — running build log: session-by-session history of what shipped, known issues, and open next steps.
- [`docs/discovery-spec.md`](docs/discovery-spec.md) — the original Discovery mode design doc; superseded by the as-built version but kept for the design reasoning trail.
