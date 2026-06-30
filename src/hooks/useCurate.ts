import { useCallback, useState } from 'react'
import { preFilter } from '../lib/preFilter'
import type { AppError, CurateResponse, CuratedTrack, Track } from '../lib/types'

export interface CurateState {
  loading: boolean
  error: AppError | null
  result: CuratedTrack[] | null
  vibe: string | null
  curate: (vibe: string) => Promise<void>
  reset: () => void
}

export function useCurate(library: Track[]): CurateState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [result, setResult] = useState<CuratedTrack[] | null>(null)
  const [vibe, setVibe] = useState<string | null>(null)

  const curate = useCallback(
    async (vibe: string) => {
      setLoading(true)
      setError(null)
      setResult(null)
      setVibe(vibe)

      try {
        const candidates = preFilter(library, vibe)

        if (candidates.length === 0) {
          setError({
            code: 'empty_results',
            message: 'Your library is empty — add some liked songs on Spotify first.',
          })
          return
        }

        const res = await fetch('/api/curate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vibe, candidates }),
        })

        if (res.status === 429) {
          setError({ code: 'rate_limit', message: 'Rate limit hit — try again in a moment.' })
          return
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          setError({
            code: 'api_error',
            message: body.error ?? `Server error (${res.status})`,
          })
          return
        }

        const data = (await res.json()) as CurateResponse

        if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
          setError({
            code: 'empty_results',
            message: "No tracks matched your vibe — try a different prompt.",
          })
          return
        }

        setResult(data.tracks)
      } catch {
        setError({ code: 'unknown', message: 'Network error — check your connection and try again.' })
      } finally {
        setLoading(false)
      }
    },
    [library]
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { loading, error, result, vibe, curate, reset }
}
