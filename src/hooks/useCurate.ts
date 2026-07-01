import { useCallback, useState } from 'react'
import { LASTFM_API_KEY } from '../lib/config'
import { fetchArtistGenres } from '../lib/lastfm'
import { preFilter } from '../lib/preFilter'
import type {
  AppError,
  CurateFilters,
  CurateResponse,
  CuratedTrack,
  Track,
  VibeExpansion,
} from '../lib/types'

export type CuratePhase = 'expanding' | 'matching' | 'enriching' | 'curating'

// Haiku vibe-expansion, cached per-vibe in localStorage (cheap call, but no reason
// to repeat it for the same prompt). Non-fatal: any failure returns null and
// curation proceeds on the built-in keyword map alone.
const EXPANSION_CACHE_KEY = 'pg_vibe_expansion'

function loadExpansionCache(): Record<string, VibeExpansion> {
  try {
    return JSON.parse(localStorage.getItem(EXPANSION_CACHE_KEY) ?? '{}') as Record<
      string,
      VibeExpansion
    >
  } catch {
    return {}
  }
}

async function fetchVibeExpansion(vibe: string): Promise<VibeExpansion | null> {
  const key = vibe.trim().toLowerCase()
  const cache = loadExpansionCache()
  if (cache[key]) return cache[key]

  try {
    const res = await fetch('/api/expand-vibe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibe }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as VibeExpansion
    cache[key] = data
    try {
      localStorage.setItem(EXPANSION_CACHE_KEY, JSON.stringify(cache))
    } catch {
      // cache is a nice-to-have; ignore quota errors
    }
    return data
  } catch {
    return null
  }
}

export interface CurateState {
  loading: boolean
  phase: CuratePhase | null
  error: AppError | null
  result: CuratedTrack[] | null
  vibe: string | null
  // Last.fm genres per curated track id — captured during curation, reused for display.
  genresByTrack: Map<string, string[]>
  curate: (vibe: string, filters?: CurateFilters) => Promise<void>
  reset: () => void
}

// True when the user has set any hard gate — used to tailor the empty-pool message.
function hasActiveGates(f?: CurateFilters): boolean {
  if (!f) return false
  return (
    f.includeGenres.length > 0 ||
    f.excludeGenres.length > 0 ||
    f.includeArtists.length > 0 ||
    f.excludeArtists.length > 0 ||
    f.decades.length > 0
  )
}

export function useCurate(library: Track[]): CurateState {
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<CuratePhase | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [result, setResult] = useState<CuratedTrack[] | null>(null)
  const [vibe, setVibe] = useState<string | null>(null)
  const [genresByTrack, setGenresByTrack] = useState<Map<string, string[]>>(new Map())

  const curate = useCallback(
    async (vibe: string, filters?: CurateFilters) => {
      setLoading(true)
      setPhase('expanding')
      setError(null)
      setResult(null)
      setVibe(vibe)

      try {
        // Expand the vibe into genre/era hints first (non-fatal), then pre-filter.
        const expansion = await fetchVibeExpansion(vibe)

        setPhase('matching')
        const candidates = preFilter(library, vibe, filters, expansion)

        if (candidates.length === 0) {
          setError({
            code: 'empty_results',
            message: hasActiveGates(filters)
              ? 'No songs match those filters — try loosening them.'
              : 'Your library is empty — add some liked songs on Spotify first.',
          })
          return
        }

        // Enrich candidates with Last.fm genres (non-fatal if it fails)
        setPhase('enriching')
        const uniqueArtists = [...new Set(candidates.map((c) => c.artists[0]).filter(Boolean))]
        const genreMap = await fetchArtistGenres(uniqueArtists, LASTFM_API_KEY).catch(
          () => new Map<string, string[]>()
        )
        const enrichedCandidates = candidates.map((c) => ({
          ...c,
          genres: c.genres.length > 0 ? c.genres : (genreMap.get(c.artists[0]) ?? []),
        }))
        // Keep the genres so the review screen can display them (no extra requests).
        setGenresByTrack(new Map(enrichedCandidates.map((c) => [c.id, c.genres])))

        setPhase('curating')
        const res = await fetch('/api/curate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vibe, candidates: enrichedCandidates, length: filters?.length }),
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
            message: 'No tracks matched your vibe — try a different prompt.',
          })
          return
        }

        setResult(data.tracks)
      } catch {
        setError({
          code: 'unknown',
          message: 'Network error — check your connection and try again.',
        })
      } finally {
        setLoading(false)
        setPhase(null)
      }
    },
    [library]
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
    setGenresByTrack(new Map())
  }, [])

  return { loading, phase, error, result, vibe, genresByTrack, curate, reset }
}
