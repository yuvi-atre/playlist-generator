import { useCallback, useState } from 'react'
import { LASTFM_API_KEY } from '../lib/config'
import { fetchArtistGenres } from '../lib/lastfm'
import { preFilter, SHORTLIST_SIZE } from '../lib/preFilter'
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
// v2: expansion gained summary/moods/energy/avoidGenres — key bump discards v1 entries.
const EXPANSION_CACHE_KEY = 'pg_vibe_expansion_v2'

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
    const data = (await res.json()) as Partial<VibeExpansion>
    // Fill any missing field so downstream code can rely on the full v2 shape.
    const expansion: VibeExpansion = {
      summary: typeof data.summary === 'string' ? data.summary : '',
      genres: Array.isArray(data.genres) ? data.genres : [],
      avoidGenres: Array.isArray(data.avoidGenres) ? data.avoidGenres : [],
      moods: Array.isArray(data.moods) ? data.moods : [],
      energy:
        data.energy === 'low' || data.energy === 'high' || data.energy === 'mixed'
          ? data.energy
          : 'medium',
      decades: Array.isArray(data.decades) ? data.decades : [],
    }
    cache[key] = expansion
    // Cap the cache so one-off vibes can't grow localStorage forever. Object
    // key order is insertion order, so dropping the first keys evicts oldest.
    const keys = Object.keys(cache)
    for (let i = 0; i < keys.length - 40; i++) delete cache[keys[i]]
    try {
      localStorage.setItem(EXPANSION_CACHE_KEY, JSON.stringify(cache))
    } catch {
      // cache is a nice-to-have; ignore quota errors
    }
    return expansion
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
  // Claude's suggested playlist title + 1–2 sentence curator note (may be empty).
  suggestedName: string | null
  curatorNote: string | null
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
  const [suggestedName, setSuggestedName] = useState<string | null>(null)
  const [curatorNote, setCuratorNote] = useState<string | null>(null)
  const [genresByTrack, setGenresByTrack] = useState<Map<string, string[]>>(new Map())

  const curate = useCallback(
    async (vibe: string, filters?: CurateFilters) => {
      setLoading(true)
      setPhase('expanding')
      setError(null)
      setResult(null)
      setSuggestedName(null)
      setCuratorNote(null)
      setVibe(vibe)

      try {
        // Expand the vibe into genre/era/mood hints first (non-fatal), then pre-filter.
        const expansion = await fetchVibeExpansion(vibe)

        // TWO-PASS candidate select. Pass 1 takes a wide shortlist with whatever
        // genre data is already on the tracks. On a cold cache that data is empty
        // and the ranking is mostly popularity — so we enrich the shortlist's
        // artists from Last.fm and RE-RANK with the genre signal actually present
        // (pass 2) before cutting to the final candidate set. Previously genres
        // arrived only after ranking, so first-run playlists were near-random.
        setPhase('matching')
        const shortlist = preFilter(library, vibe, filters, expansion, SHORTLIST_SIZE)

        if (shortlist.length === 0) {
          setError({
            code: 'empty_results',
            message: hasActiveGates(filters)
              ? 'No songs match those filters — try loosening them.'
              : 'Your library is empty — add some liked songs on Spotify first.',
          })
          return
        }

        // Enrich the shortlist with Last.fm genres (non-fatal if it fails).
        // Only artists whose tracks still LACK genres are fetched — zero calls
        // when the library is pre-enriched (demo snapshot, warm caches).
        setPhase('enriching')
        const missingArtists = [
          ...new Set(
            shortlist
              .filter((c) => c.genres.length === 0)
              .map((c) => c.artists[0])
              .filter(Boolean)
          ),
        ]
        const genreMap =
          missingArtists.length > 0
            ? await fetchArtistGenres(missingArtists, LASTFM_API_KEY).catch(
                () => new Map<string, string[]>()
              )
            : new Map<string, string[]>()
        const trackById = new Map(library.map((t) => [t.id, t]))
        const enrichedPool: Track[] = shortlist.flatMap((c) => {
          const t = trackById.get(c.id)
          if (!t) return []
          return [t.genres.length > 0 ? t : { ...t, genres: genreMap.get(t.artists[0]) ?? [] }]
        })

        // Pass 2: re-rank the enriched shortlist and cut to the final candidates.
        const candidates = preFilter(enrichedPool, vibe, filters, expansion)
        // Keep the genres so the review screen can display them (no extra requests).
        setGenresByTrack(new Map(candidates.map((c) => [c.id, c.genres])))

        setPhase('curating')
        const res = await fetch('/api/curate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vibe,
            candidates,
            length: filters?.length,
            interpretation: expansion
              ? { summary: expansion.summary, moods: expansion.moods, energy: expansion.energy }
              : undefined,
          }),
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

        setSuggestedName(data.playlistName?.trim() || null)
        setCuratorNote(data.curatorNote?.trim() || null)
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
    setSuggestedName(null)
    setCuratorNote(null)
    setGenresByTrack(new Map())
  }, [])

  return {
    loading,
    phase,
    error,
    result,
    vibe,
    suggestedName,
    curatorNote,
    genresByTrack,
    curate,
    reset,
  }
}
