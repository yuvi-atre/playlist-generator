import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { originAllowed } from '../src/lib/serverGuard.js'
import type { VibeExpansion } from '../src/lib/types.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cheap Haiku pass: expand a free-text vibe into a full interpretation used by
// BOTH curation stages. genres/avoidGenres/decades feed the local pre-filter so
// off-dictionary vibes still produce a real genre signal; summary/moods/energy
// are forwarded to the Sonnet curation prompt so it shares the same reading of
// the vibe that shaped the candidate pool. ~$0.0003/call, cached per-vibe on
// the client.
const SYSTEM_PROMPT = `You interpret a short music "vibe" prompt so a playlist generator can filter and curate a personal music library.

Return STRICT JSON only — no prose, no markdown fences.

Schema:
{
  "summary": "<one sentence interpreting the vibe>",
  "genres": ["<lowercase genre>", ...],
  "avoidGenres": ["<lowercase genre>", ...],
  "moods": ["<lowercase adjective>", ...],
  "energy": "low" | "medium" | "high" | "mixed",
  "decades": [<4-digit start year>, ...]
}

Rules:
- summary: one plain sentence capturing what the person actually wants to hear (activity, feeling, setting). No fluff.
- genres: 4–10 lowercase genre names/keywords that fit the vibe, written as they'd appear in music tags (e.g. "lo-fi", "hip hop", "shoegaze", "city pop", "ambient", "synthwave"). Prefer common genre words over hyper-specific microgenres.
- avoidGenres: 0–5 genres that would clearly clash with the vibe (e.g. "death metal" for a sleep vibe). Only obvious clashes — leave empty if nothing clearly clashes.
- moods: 2–6 lowercase mood adjectives (e.g. "nostalgic", "driving", "hazy", "triumphant").
- energy: the overall energy level the vibe implies. Use "mixed" if it genuinely spans levels.
- decades: include ONLY if the vibe clearly implies an era (e.g. "80s synthwave" → [1980]; "2000s emo" → [2000]). Use 4-digit start years. Empty array if no era is implied.
- Do not invent artists or song titles. If the vibe names an artist, reflect their style in genres/moods but do not put the artist name in genres.`

const EXPANSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'genres', 'avoidGenres', 'moods', 'energy', 'decades'],
  properties: {
    summary: { type: 'string' },
    genres: { type: 'array', items: { type: 'string' } },
    avoidGenres: { type: 'array', items: { type: 'string' } },
    moods: { type: 'array', items: { type: 'string' } },
    energy: { type: 'string', enum: ['low', 'medium', 'high', 'mixed'] },
    decades: { type: 'array', items: { type: 'integer' } },
  },
} as const

// Lowercase, trim, drop blanks, cap the list — Haiku output is a soft signal,
// so anything malformed just becomes empty rather than failing the request.
function sanitizeStrings(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((g): g is string => typeof g === 'string')
        .map((g) => g.toLowerCase().trim())
        .filter(Boolean)
        .slice(0, max)
    : []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const body = req.body as { vibe?: string }
  if (typeof body.vibe !== 'string' || body.vibe.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty vibe' })
  }
  const vibe = body.vibe.trim().slice(0, 300)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Vibe: "${vibe}"` }],
      output_config: { format: { type: 'json_schema', schema: EXPANSION_SCHEMA } },
    })

    if (message.stop_reason === 'max_tokens') {
      return res.status(500).json({ error: 'Expansion response was truncated' })
    }
    if (message.stop_reason === 'refusal') {
      return res.status(500).json({ error: 'Expansion request was declined' })
    }

    const block = message.content[0]
    if (block.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type from Claude' })
    }

    let parsed: Partial<VibeExpansion>
    try {
      parsed = JSON.parse(block.text) as Partial<VibeExpansion>
    } catch {
      console.error('Haiku raw response:', block.text)
      return res.status(500).json({ error: 'Expansion returned invalid JSON' })
    }

    const energy =
      parsed.energy === 'low' || parsed.energy === 'high' || parsed.energy === 'mixed'
        ? parsed.energy
        : 'medium'
    const expansion: VibeExpansion = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 300) : '',
      genres: sanitizeStrings(parsed.genres, 12),
      avoidGenres: sanitizeStrings(parsed.avoidGenres, 6),
      moods: sanitizeStrings(parsed.moods, 8),
      energy,
      decades: [],
    }
    // Haiku sometimes lists decades from genre association ("synthwave → 80s")
    // even when the vibe implies no era. A real era cue yields 1–3 decades;
    // anything broader is noise, so treat it as "no era signal".
    const decades = Array.isArray(parsed.decades)
      ? parsed.decades.filter((d): d is number => Number.isInteger(d) && d >= 1900 && d < 2100)
      : []
    if (decades.length <= 3) expansion.decades = decades
    return res.status(200).json(expansion)
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
