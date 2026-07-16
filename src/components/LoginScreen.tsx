import { useState } from 'react'
import { RobotHero } from './RobotMascot'
import type { AppError } from '../lib/types'

interface Props {
  onLogin: () => void
  onTryDemo: () => void
  loading: boolean
  error: AppError | null
}

export function LoginScreen({ onLogin, onTryDemo, loading, error }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <RobotHero className="w-28 h-auto" />
        <h1 className="text-3xl font-semibold tracking-tight text-white">Playlist Generator</h1>
        <p className="text-zinc-400 max-w-sm text-sm leading-relaxed">
          Describe a vibe — get a curated playlist pulled straight from your liked songs.
        </p>
      </div>

      <button
        onClick={onLogin}
        disabled={loading}
        className="flex items-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-60
                   disabled:cursor-not-allowed text-black font-semibold px-8 py-3 rounded-full
                   transition-colors text-sm"
      >
        <SpotifyIcon />
        {loading ? 'Redirecting…' : 'Continue with Spotify'}
      </button>

      {/* Spotify caps the beta at 5 allowlisted accounts — the demo is the
          public tier: full curation on a bundled sample library, no login. */}
      <button
        onClick={onTryDemo}
        className="text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-4 transition-colors hover:text-white"
      >
        or try the demo — no account needed
      </button>

      {error && <p className="text-red-400 text-sm text-center max-w-xs">{error.message}</p>}

      <WaitlistForm />
    </div>
  )
}

// Spotify's dev-mode allowlist caps the beta at 5 testers, so login only works
// for allowlisted accounts. Everyone else lands here: signups fire a Discord
// webhook (see api/waitlist.ts) and slots rotate manually in the dashboard.
// Also rendered inside the demo's review screen in place of Save-to-Spotify.
export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value || status === 'sending') return
    setStatus('sending')
    setMessage(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      if (res.ok) {
        setStatus('done')
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setMessage(body.error ?? 'Something went wrong — try again.')
        setStatus('error')
      }
    } catch {
      setMessage('Network error — try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <p className="max-w-xs text-center text-sm text-zinc-400">
        You’re on the list 🎧 I’ll reach out when a slot opens up.
      </p>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex w-full max-w-xs flex-col gap-2">
      <p className="text-center text-xs leading-relaxed text-zinc-500">
        Beta is capped at 5 Spotify accounts (their rule) — slots rotate.
        <br />
        Drop your email and I’ll DM you when one opens.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={status === 'sending'}
          aria-label="Email for the beta waitlist"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === 'sending' || !email.trim()}
          className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'sending' ? 'Joining…' : 'Join waitlist'}
        </button>
      </div>
      {message && <p className="text-center text-xs text-red-400">{message}</p>}
    </form>
  )
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}
