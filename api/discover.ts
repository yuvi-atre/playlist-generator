import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { originAllowed } from '../src/lib/serverGuard.js'
import { verifyDiscovery } from '../src/lib/discoveryVerify.js'
import type { SearchResultTrack, SongProposal } from '../src/lib/discoveryVerify.js'
import type { DiscoverRequest, DiscoverResponse } from '../src/lib/types.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Spotify Client Credentials (app-level) token — verifies Discovery proposals
// via Search WITHOUT a user's OAuth token, which is what lets Discovery work
// in demo mode too (no login = no user token, but the app itself still
// authenticates fine to search the public catalog). Needs SPOTIFY_CLIENT_SECRET
// in the environment; the client ID isn't secret (already public via PKCE), so
// this reuses VITE_SPOTIFY_CLIENT_ID rather than a second copy of the value.
// Cached in module scope — cheap to refetch on a cold start, avoided within a
// warm one. Lives here (not src/lib) because src/lib is type-checked under the
// browser tsconfig, which has no Node types for `process`/`Buffer`.
let cachedAppToken: { token: string; expiresAt: number } | null = null

async function getAppAccessToken(): Promise<string> {
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt) return cachedAppToken.token

  const id = process.env.VITE_SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error('Spotify client credentials not configured (SPOTIFY_CLIENT_SECRET missing)')
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify client-credentials token request failed (${res.status})`)

  const data = (await res.json()) as { access_token: string; expires_in: number }
  // Refresh a minute early so a request never straddles the real expiry.
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedAppToken.token
}

// Hard ceilings — same posture as curate.ts: protect spend and payload size
// from a buggy/malicious client, independent of what the real UI ever sends.
const MAX_VIBE_CHARS = 300
const MAX_TASTE_ITEMS = 20
const MAX_LIBRARY_IDS = 2000
const DEFAULT_COUNT = 10
const MAX_COUNT = 15
const SEARCH_CONCURRENCY = 5

function buildSystemPrompt(count: number): string {
  return `You are a music discovery engine. Given a vibe and a listener's taste profile (their own top genres and artists), propose real songs that fit the vibe but are NOT already in their library — the entire point is introducing them to something new.

Return STRICT JSON only — no prose, no markdown fences.

Schema:
{ "suggestions": [ { "title": "<song title>", "artist": "<primary artist>", "reason": "<one-line reason, max 10 words>" } ] }

Rules:
- Propose exactly ${count} real, existing songs.
- Do NOT propose songs by the artists in "avoid" below — they already have plenty from those artists — UNLESS the vibe explicitly names one of them.
- Lean toward tracks well-known enough that a music search engine will find them. Never invent a song — if you're not confident it's real, leave it out.
- Prefer songs adjacent to their taste (similar genre/mood) but genuinely new to them, not just more of what they already have.
- Never propose the same song twice.`
}

const DISCOVERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'artist', 'reason'],
        properties: {
          title: { type: 'string' },
          artist: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const

function formatInterpretation(interp: DiscoverRequest['interpretation']): string {
  if (!interp || typeof interp !== 'object') return ''
  const parts: string[] = []
  if (typeof interp.summary === 'string' && interp.summary) {
    parts.push(`Interpretation: ${interp.summary.slice(0, 400)}`)
  }
  if (Array.isArray(interp.moods) && interp.moods.length) {
    parts.push(`Target moods: ${interp.moods.filter((m) => typeof m === 'string').join(', ')}`)
  }
  if (typeof interp.energy === 'string' && interp.energy)
    parts.push(`Target energy: ${interp.energy}`)
  return parts.length ? `${parts.join('\n')}\n\n` : ''
}

// Spotify's field-scoped search syntax: track:"..." artist:"...". Strip
// embedded quotes from the proposal first so a stray `"` can't break the query.
function buildSearchQuery(title: string, artist: string): string {
  const clean = (s: string) => s.replace(/"/g, '')
  return `track:"${clean(title)}" artist:"${clean(artist)}"`
}

interface SpotifyApiTrack {
  id: string
  name: string
  popularity: number
  artists: Array<{ name: string }>
  album: { images: Array<{ url: string }>; release_date: string }
}

async function searchTrack(token: string, proposal: SongProposal): Promise<SearchResultTrack[]> {
  try {
    const q = buildSearchQuery(proposal.title, proposal.artist)
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = (await res.json()) as { tracks?: { items: SpotifyApiTrack[] } }
    return (data.tracks?.items ?? []).map((t) => {
      const images = t.album.images
      const year = parseInt(t.album.release_date.slice(0, 4), 10)
      return {
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => a.name),
        popularity: t.popularity,
        albumArt: images.length ? images[images.length - 1].url : null,
        year: isNaN(year) ? 0 : year,
      }
    })
  } catch {
    return []
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const body = req.body as Partial<DiscoverRequest>
  if (typeof body.vibe !== 'string' || body.vibe.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty vibe' })
  }

  const vibe = body.vibe.trim().slice(0, MAX_VIBE_CHARS)
  const tasteProfile = {
    genres: Array.isArray(body.tasteProfile?.genres)
      ? body.tasteProfile.genres.filter((g) => typeof g === 'string').slice(0, MAX_TASTE_ITEMS)
      : [],
    artists: Array.isArray(body.tasteProfile?.artists)
      ? body.tasteProfile.artists.filter((a) => typeof a === 'string').slice(0, MAX_TASTE_ITEMS)
      : [],
  }
  const libraryTrackIds = new Set(
    Array.isArray(body.libraryTrackIds)
      ? body.libraryTrackIds.filter((id) => typeof id === 'string').slice(0, MAX_LIBRARY_IDS)
      : []
  )
  const count = Math.min(
    MAX_COUNT,
    Math.max(1, Number.isInteger(body.count) ? (body.count as number) : DEFAULT_COUNT)
  )

  // Discovery is an enhancement, not a hard dependency — degrade to "no
  // discoveries" rather than error, so a missing/misconfigured secret never
  // blocks curation, which runs as an independent parallel request.
  let appToken: string
  try {
    appToken = await getAppAccessToken()
  } catch (err) {
    console.error('Discovery: app token unavailable —', err)
    return res.status(200).json({ tracks: [] } satisfies DiscoverResponse)
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      thinking: { type: 'disabled' },
      system: buildSystemPrompt(count),
      messages: [
        {
          role: 'user',
          content: `Vibe: "${vibe}"\n\n${formatInterpretation(body.interpretation)}Listener's top genres: ${tasteProfile.genres.join(', ') || 'unknown'}\nAvoid songs by (already well-covered in their library): ${tasteProfile.artists.join(', ') || 'none'}`,
        },
      ],
      output_config: { format: { type: 'json_schema', schema: DISCOVERY_SCHEMA } },
    })

    if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') {
      return res.status(200).json({ tracks: [] } satisfies DiscoverResponse)
    }
    const block = message.content[0]
    if (block.type !== 'text') {
      return res.status(200).json({ tracks: [] } satisfies DiscoverResponse)
    }

    let parsed: { suggestions?: Array<{ title: string; artist: string; reason: string }> }
    try {
      parsed = JSON.parse(block.text) as typeof parsed
    } catch {
      console.error('Discovery: invalid JSON from Claude —', block.text)
      return res.status(200).json({ tracks: [] } satisfies DiscoverResponse)
    }
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []

    // Verify each proposal against Spotify Search, concurrency-limited.
    const verified: DiscoverResponse['tracks'] = []
    for (let i = 0; i < suggestions.length; i += SEARCH_CONCURRENCY) {
      const batch = suggestions.slice(i, i + SEARCH_CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (s) => {
          if (typeof s.title !== 'string' || typeof s.artist !== 'string') return null
          const candidates = await searchTrack(appToken, { title: s.title, artist: s.artist })
          const match = verifyDiscovery(
            { title: s.title, artist: s.artist },
            candidates,
            libraryTrackIds
          )
          if (!match) return null
          return {
            id: match.id,
            name: match.name,
            artists: match.artists,
            albumArt: match.albumArt,
            year: match.year,
            reason: typeof s.reason === 'string' ? s.reason.slice(0, 200) : '',
          }
        })
      )
      for (const r of results) if (r) verified.push(r)
    }

    // De-dupe verified results against EACH OTHER (Claude can propose the same
    // song two different ways and both verify to the same Spotify ID).
    const seen = new Set<string>()
    const deduped = verified.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))

    return res.status(200).json({ tracks: deduped } satisfies DiscoverResponse)
  } catch (err) {
    // Non-fatal by design — log and return empty rather than fail the request.
    console.error('Discovery failed —', err)
    return res.status(200).json({ tracks: [] } satisfies DiscoverResponse)
  }
}
