import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { VibeExpansion } from '../src/lib/types.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cheap Haiku pass: expand a free-text vibe into genres + eras used by the local
// pre-filter. Runs BEFORE preFilter so off-dictionary vibes (which the fixed
// keyword map misses) still produce a real genre signal instead of falling back
// to popularity. ~$0.0003/call, cached per-vibe on the client.
const SYSTEM_PROMPT = `You expand a short music "vibe" prompt into concrete genres and eras used to filter a personal music library.

Return STRICT JSON only — no prose, no markdown fences.

Schema:
{ "genres": ["<lowercase genre>", ...], "decades": [<4-digit start year>, ...] }

Rules:
- genres: 4–10 lowercase genre names/keywords that fit the vibe, written as they'd appear in music tags (e.g. "lo-fi", "hip hop", "shoegaze", "city pop", "ambient", "synthwave"). Prefer common genre words over hyper-specific microgenres.
- decades: include ONLY if the vibe clearly implies an era (e.g. "80s synthwave" → [1980]; "2000s emo" → [2000]). Use 4-digit start years. Empty array if no era is implied.
- Do not invent artists or song titles. Genres and eras only.`

const EXPANSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['genres', 'decades'],
  properties: {
    genres: { type: 'array', items: { type: 'string' } },
    decades: { type: 'array', items: { type: 'integer' } },
  },
} as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body as { vibe?: string }
  if (typeof body.vibe !== 'string' || body.vibe.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty vibe' })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Vibe: "${body.vibe.trim()}"` }],
      output_config: { format: { type: 'json_schema', schema: EXPANSION_SCHEMA } },
    })

    if (message.stop_reason === 'max_tokens') {
      return res.status(500).json({ error: 'Expansion response was truncated' })
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

    // Sanitize defensively — this is a soft signal, so a bad field just becomes empty.
    const genres = Array.isArray(parsed.genres)
      ? parsed.genres
          .filter((g): g is string => typeof g === 'string')
          .map((g) => g.toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 12)
      : []
    const decades = Array.isArray(parsed.decades)
      ? parsed.decades.filter((d): d is number => Number.isInteger(d) && d >= 1900 && d < 2100)
      : []

    const expansion: VibeExpansion = { genres, decades }
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
