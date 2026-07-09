import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { originAllowed } from '../src/lib/serverGuard.js'
import type { CurateRequest, CurateResponse, PlaylistLength } from '../src/lib/types.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Hard ceilings — protect token spend from a buggy/malicious client sending
// the whole library (or a novel) instead of the pre-filtered set.
const MAX_ACCEPTED_CANDIDATES = 200
const MAX_VIBE_CHARS = 300

// Target track-count band per requested length. `min` is a soft floor — the model
// is told to return fewer if fewer genuinely fit rather than padding with weak picks.
const LENGTH_TARGETS: Record<PlaylistLength, { min: number; aim: number; max: number }> = {
  short: { min: 10, aim: 15, max: 18 },
  medium: { min: 20, aim: 25, max: 30 },
  long: { min: 35, aim: 45, max: 50 },
}

function buildSystemPrompt(length: PlaylistLength): string {
  const { min, aim, max } = LENGTH_TARGETS[length]
  return `You are an expert music curator building a playlist from a person's own liked songs. You receive a vibe prompt (sometimes with an interpretation of it) and a list of candidate tracks pre-filtered from their library. Select and order the tracks that authentically fit the vibe.

Selection principles:
- Aim for about ${aim} tracks (${min}–${max}). Quality over quantity: if fewer than ${aim} candidates genuinely fit, return fewer — DO NOT pad with weak picks. Never exceed ${max}.
- Fit the vibe's mood and energy, not just its genre. A genre-matched track with the wrong mood is a bad pick.
- Cohesion over popularity: the playlist should feel like one deliberate session, not a grab-bag of hits.
- Mix it up: avoid letting one artist dominate unless the vibe explicitly asks for that artist.
- Never include two versions of the same song (remix, live, sped-up, cover) — pick the best-fitting one.
- Only use track ids from the provided candidate list.

Ordering principles:
- Open with a strong, immediately vibe-setting track.
- Shape an energy arc that suits the vibe (a workout builds, a sleep playlist descends, a road trip rolls in waves).
- End on something memorable, not leftovers.

Also return:
- "playlistName": a short evocative title (2–5 words, no quotes/emoji) someone would be happy to keep in their Spotify.
- "curatorNote": 1–2 sentences on the shape of the playlist — what it opens with, how it moves. Written to the listener, no marketing fluff.
- Each track's "reason": max 10 words, specific to why THIS track fits THIS vibe. Never generic praise.`
}

// Structured-outputs schema — forces the model to return JSON matching this exact
// shape, so no prose, no markdown fences, and no truncated/garbled output slips through.
const CURATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['playlistName', 'curatorNote', 'tracks'],
  properties: {
    playlistName: { type: 'string' },
    curatorNote: { type: 'string' },
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reason'],
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const

function formatCandidates(candidates: CurateRequest['candidates']): string {
  return candidates
    .map((t, i) => {
      const artists = t.artists.join(', ')
      const genres = t.genres.length ? t.genres.join(', ') : 'unknown'
      return `${i + 1}. [${t.id}] "${t.name}" by ${artists} (${t.year}) — genres: ${genres}`
    })
    .join('\n')
}

// The Haiku vibe-interpretation (when the client has one) — gives the curation
// pass the same reading of the vibe that shaped the candidate pool.
function formatInterpretation(interp: CurateRequest['interpretation']): string {
  if (!interp || typeof interp !== 'object') return ''
  const parts: string[] = []
  if (typeof interp.summary === 'string' && interp.summary) {
    parts.push(`Interpretation: ${interp.summary.slice(0, 400)}`)
  }
  if (Array.isArray(interp.moods) && interp.moods.length) {
    parts.push(`Target moods: ${interp.moods.filter((m) => typeof m === 'string').join(', ')}`)
  }
  if (typeof interp.energy === 'string' && interp.energy) {
    parts.push(`Target energy: ${interp.energy}`)
  }
  return parts.length ? `${parts.join('\n')}\n\n` : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const body = req.body as Partial<CurateRequest>

  if (
    typeof body.vibe !== 'string' ||
    body.vibe.trim() === '' ||
    !Array.isArray(body.candidates) ||
    body.candidates.length === 0
  ) {
    return res.status(400).json({ error: 'Missing or empty vibe / candidates' })
  }

  const vibe = body.vibe.trim().slice(0, MAX_VIBE_CHARS)
  // Coerce each candidate to the exact shape the prompt builder needs — a
  // malformed item (missing artists, non-string genre) must not 500 the request.
  const candidates = body.candidates
    .slice(0, MAX_ACCEPTED_CANDIDATES)
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => ({
      id: c.id,
      name: c.name,
      artists: Array.isArray(c.artists) ? c.artists.filter((a) => typeof a === 'string') : [],
      genres: Array.isArray(c.genres) ? c.genres.filter((g) => typeof g === 'string') : [],
      year: typeof c.year === 'number' && Number.isFinite(c.year) ? c.year : 0,
    }))
  if (candidates.length === 0) {
    return res.status(400).json({ error: 'No valid candidates' })
  }
  const length: PlaylistLength =
    body.length === 'short' || body.length === 'long' ? body.length : 'medium'

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      system: buildSystemPrompt(length),
      messages: [
        {
          role: 'user',
          content: `Vibe: "${vibe.trim()}"\n\n${formatInterpretation(body.interpretation)}Candidates:\n${formatCandidates(candidates)}`,
        },
      ],
      output_config: { format: { type: 'json_schema', schema: CURATION_SCHEMA } },
    })

    if (message.stop_reason === 'max_tokens') {
      return res.status(500).json({ error: 'Curation response was truncated — try again' })
    }
    if (message.stop_reason === 'refusal') {
      return res.status(500).json({ error: 'Curation request was declined' })
    }

    const block = message.content[0]
    if (block.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type from Claude' })
    }

    let parsed: CurateResponse
    try {
      parsed = JSON.parse(block.text) as CurateResponse
    } catch {
      console.error('Claude raw response:', block.text)
      return res.status(500).json({ error: 'Claude returned invalid JSON' })
    }

    if (!Array.isArray(parsed.tracks)) {
      return res.status(500).json({ error: 'Malformed curation response' })
    }

    // Claude occasionally hallucinates or garbles an ID — drop anything not in the
    // candidate list rather than surfacing a fake track to the client.
    const candidateIds = new Set(candidates.map((c) => c.id))
    const tracks = parsed.tracks.filter((t) => candidateIds.has(t.id))

    if (tracks.length === 0) {
      return res.status(500).json({ error: 'Curation returned no valid tracks' })
    }

    const playlistName =
      typeof parsed.playlistName === 'string' ? parsed.playlistName.trim().slice(0, 100) : ''
    const curatorNote =
      typeof parsed.curatorNote === 'string' ? parsed.curatorNote.trim().slice(0, 400) : ''

    return res.status(200).json({ tracks, playlistName, curatorNote })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 429) {
        return res.status(429).json({ error: 'Rate limit — try again shortly' })
      }
      return res.status(500).json({ error: `Anthropic API error: ${err.message}` })
    }
    return res.status(500).json({ error: 'Internal server error' })
  }
}
