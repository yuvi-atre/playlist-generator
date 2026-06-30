import { useCallback, useRef, useState } from 'react'
import { LIBRARY_CACHE_TTL_MS } from '../lib/config'
import { buildLibrary, fetchAllLikedSongs, fetchArtistsBatch } from '../lib/spotify'
import { storage } from '../lib/storage'
import type { AppError, Track } from '../lib/types'

export interface LibraryState {
  tracks: Track[]
  fetchedAt: number | null
  loading: boolean
  progress: number | null // tracks fetched so far (null when not loading)
  error: AppError | null
  load: (forceRefresh?: boolean) => Promise<void>
}

export function useLibrary(getAccessToken: () => Promise<string>): LibraryState {
  const cached = storage.library.get()
  const [tracks, setTracks] = useState<Track[]>(cached?.tracks ?? [])
  const [fetchedAt, setFetchedAt] = useState<number | null>(cached?.fetchedAt ?? null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  // Refs so `load` stays stable even as tracks/fetchedAt change
  const stateRef = useRef({ tracks, fetchedAt })
  stateRef.current = { tracks, fetchedAt }

  const load = useCallback(
    async (forceRefresh = false) => {
      const { tracks: currentTracks, fetchedAt: currentFetchedAt } = stateRef.current

      if (
        !forceRefresh &&
        currentFetchedAt !== null &&
        Date.now() - currentFetchedAt < LIBRARY_CACHE_TTL_MS &&
        currentTracks.length > 0
      ) {
        return
      }

      setLoading(true)
      setProgress(0)
      setError(null)

      try {
        const token = await getAccessToken()

        // Stage 1: paginate liked songs
        const savedTracks = await fetchAllLikedSongs(token, (n) => setProgress(n))

        if (savedTracks.length === 0) {
          const empty: Track[] = []
          setTracks(empty)
          setFetchedAt(Date.now())
          storage.library.set(empty)
          return
        }

        // Stage 2: batch-fetch artist genres (non-fatal — 403s gracefully skip genres)
        const artistIds = [
          ...new Set(savedTracks.flatMap((item) => item.track.artists.map((a) => a.id))),
        ]
        let artistMap: Awaited<ReturnType<typeof fetchArtistsBatch>> = new Map()
        try {
          artistMap = await fetchArtistsBatch(token, artistIds)
        } catch (err) {
          console.warn('Artist genre fetch failed — continuing without genres:', err)
        }

        // Stage 3: assemble Track objects
        const library = buildLibrary(savedTracks, artistMap)

        setTracks(library)
        setFetchedAt(Date.now())
        storage.library.set(library)
      } catch (err) {
        const isTokenErr =
          err instanceof Error && (err as Error & { code?: string }).code === 'token_expired'
        setError({
          code: isTokenErr ? 'token_expired' : 'api_error',
          message: err instanceof Error ? err.message : 'Failed to load library.',
        })
      } finally {
        setLoading(false)
        setProgress(null)
      }
    },
    [getAccessToken]
  )

  return { tracks, fetchedAt, loading, progress, error, load }
}
