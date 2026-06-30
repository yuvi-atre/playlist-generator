import { useEffect, useState } from 'react'
import { exchangeCode } from '../lib/spotify'
import { storage } from '../lib/storage'

export function CallbackHandler() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void handleCallback()
  }, [])

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(`Spotify denied access: ${errorParam}`)
      return
    }

    if (!code || !state) {
      setError('Callback is missing required parameters.')
      return
    }

    const storedState = sessionStorage.getItem('pkce_state')
    const verifier = sessionStorage.getItem('pkce_verifier')

    if (state !== storedState) {
      setError('State mismatch — possible CSRF. Please try logging in again.')
      return
    }

    if (!verifier) {
      setError('Missing PKCE verifier. Please try logging in again.')
      return
    }

    try {
      const tokens = await exchangeCode(code, verifier)
      sessionStorage.removeItem('pkce_state')
      sessionStorage.removeItem('pkce_verifier')
      storage.tokens.set(tokens)
      window.location.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token exchange failed. Please try again.')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400 text-center max-w-sm">{error}</p>
        <a href="/" className="text-zinc-400 hover:text-white text-sm underline transition-colors">
          Back to home
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-400">
        <Spinner />
        <span className="text-sm">Logging you in…</span>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="w-5 h-5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
