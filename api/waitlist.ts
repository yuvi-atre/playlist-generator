import type { VercelRequest, VercelResponse } from '@vercel/node'
import { originAllowed } from '../src/lib/serverGuard.js'

// Beta waitlist: no database — each signup fires a Discord webhook, so requests
// arrive as push notifications with a timestamp (which doubles as the rotation
// record). Configure DISCORD_WEBHOOK_URL in Vercel env; until then this returns
// 503 and the form shows a friendly "not open yet" message.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const body = req.body as { email?: string; website?: string }

  // Honeypot: real users never see (or fill) the "website" field. Bots that do
  // get a fake success so they don't retry.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(200).json({ ok: true })
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : ''
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'That doesn’t look like an email address' })
  }

  const hook = process.env.DISCORD_WEBHOOK_URL
  if (!hook) {
    return res.status(503).json({ error: 'Waitlist isn’t open yet — check back soon' })
  }

  try {
    // Strip @ so a crafted email can't ping @everyone in the Discord channel.
    const safe = email.replace(/@/g, '[at]')
    const hookRes = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🎧 **Beta request** — ${safe}\n${new Date().toISOString()}`,
      }),
    })
    if (!hookRes.ok) {
      console.error(`Discord webhook ${hookRes.status}`)
      return res.status(500).json({ error: 'Could not record your request — try again' })
    }
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Could not record your request — try again' })
  }
}
