import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { CurateRequest, CurateResponse } from '../src/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a music curator. Given a vibe prompt and a list of candidate tracks from a user's liked-songs library, select the best 20–25 tracks that authentically fit the vibe.

Return STRICT JSON only — no prose, no markdown fences, no text outside the JSON object.

Schema:
{
  "tracks": [
    { "id": "<spotify track id>", "reason": "<one-line reason, max 10 words>" }
  ]
}

Rules:
- Pick 20–25 tracks. Never fewer than 15, never more than 30.
- Only use IDs from the provided candidate list.
- Order tracks for good listening flow.
- Reasons must be specific to the vibe, not generic.`

function formatCandidates(candidates: CurateRequest['candidates']): string {
  return candidates
    .map((t, i) => {
      const artists = t.artists.join(', ')
      const genres = t.genres.length ? t.genres.join(', ') : 'unknown'
      return `${i + 1}. [${t.id}] "${t.name}" by ${artists} (${t.year}) — genres: ${genres}`
    })
    .join('\n')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
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

  const { vibe, candidates } = body

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Vibe: "${vibe.trim()}"\n\nCandidates:\n${formatCandidates(candidates)}`,
        },
      ],
    })

    const block = message.content[0]
    if (block.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type from Claude' })
    }

    let parsed: CurateResponse
    try {
      parsed = JSON.parse(block.text) as CurateResponse
    } catch {
      return res.status(500).json({ error: 'Claude returned invalid JSON' })
    }

    if (!Array.isArray(parsed.tracks)) {
      return res.status(500).json({ error: 'Malformed curation response' })
    }

    return res.status(200).json(parsed)
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
