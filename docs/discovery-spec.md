# Discovery Mode — Spec (not yet built)

Most-requested feature from the LinkedIn launch: "give me NEW songs, not just my
liked songs." This spec is the agreed design; implementation deferred.

## Constraint that shapes everything

Spotify's recommendations / related-artists / audio-features endpoints are
**deprecated and 403 for this app** (see CLAUDE.md). The Search API works fine
with any user token. So discovery = "propose songs by knowledge, verify by
search" — never "ask Spotify to recommend."

## Design

A **"Discover new music" toggle** in the Filters panel, default OFF (the
product's identity stays "from YOUR liked songs"). When ON, ~20% of the final
playlist is tracks the user does NOT have saved, clearly badged.

### Pipeline (one new stage between curation and review)

1. **Taste profile (client, free):** top ~10 canonical genres by artist count
   (already computed for the filter chips) + top ~15 artists by track count.
2. **`POST /api/discover` (new endpoint, Sonnet):**
   - In: `{ vibe, interpretation, tasteProfile, excludeArtists?: string[], count: ~10 }`
     plus the library's artist list so proposals skew NEW-to-the-user.
   - Out (structured outputs): `{ suggestions: [{ title, artist, why }] }` —
     real songs from model knowledge, no IDs (models hallucinate IDs; never ask).
   - Prompt: fit the SAME vibe interpretation as the curation pass; prefer
     well-known-enough tracks (search must find them); avoid the user's top
     artists unless the vibe names one.
3. **Verify via Spotify Search (client, user token):**
   `GET /v1/search?q=track:"<title>" artist:"<artist>"&type=track&limit=3`
   - Accept a result only if artist matches (case-insensitive exact on any
     listed artist) and title fuzzy-matches; prefer highest-popularity match
     (filters out karaoke/cover/sped-up versions).
   - Drop anything unverified AND anything whose ID is already in the library
     (Claude may propose a song the user already liked).
   - ~10 parallel GETs ≈ <1s added latency.
4. **Merge:** verified discoveries append to the curated list with a green
   `NEW` pill on the card (reuses the existing card layout; the per-track
   remove/restore button already handles "no thanks"). Save works unchanged —
   playlists accept any track URIs.

### UI

- Filters panel: toggle row "Discover — mix in songs you don't have yet".
- Review screen: `NEW` badge; curator note unchanged (curation pass doesn't
  know about discoveries — keep the stages decoupled in v1).
- Loading: new phase label "Finding new songs…" between curating and done.

### Cost & latency

- +1 Sonnet call: ~1.5k in / ~500 out ≈ **+0.5–1¢ per discovery playlist**.
- +~10 Spotify search GETs, parallel: ~+1s perceived.

### Risks / mitigations

- **Hallucinated songs** → search verification drops them (expect ~1–3 of 10).
- **Wrong version matched** → exact-artist + popularity preference.
- **Regional availability** → pass the user's `market` from their profile.
- **Demo mode:** demo users have no Spotify token → no search verification →
  Discovery toggle hidden in demo.

### Open decisions (decide at build time)

1. Fixed ~20% mix vs. a user-facing amount control (recommend: fixed in v1).
2. Do discoveries count toward the length target or add on top? (recommend: add
   on top, so "short" still means ~15 of YOUR songs.)
3. Second LinkedIn post angle: "the AI now DJs songs I don't even have yet."
