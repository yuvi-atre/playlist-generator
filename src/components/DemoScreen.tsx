import { useEffect, useState } from 'react'
import { LibraryScreen } from './LibraryScreen'
import type { LibraryState } from '../hooks/useLibrary'
import type { Track } from '../lib/types'

// Demo mode: the full curation experience with ZERO Spotify auth. The library
// is a static snapshot (public/demo-library.json — the creator's 813 liked
// songs with Last.fm genres baked in), so nothing here can touch a Spotify
// account: no OAuth, no refresh, and Save is replaced by a waitlist CTA
// inside CurateResult (via LibraryScreen's demoMode flag).
export function DemoScreen({ onExit }: { onExit: () => void }) {
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/demo-library.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ tracks: Track[] }>
      })
      .then((data) => {
        if (!cancelled) setTracks(data.tracks)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the demo library — refresh to try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Shape the static snapshot like a real LibraryState so LibraryScreen (and
  // everything under it) works unchanged.
  const library: LibraryState = {
    tracks: tracks ?? [],
    fetchedAt: null,
    loading: tracks === null && error === null,
    progress: null,
    error: error ? { code: 'api_error', message: error } : null,
    load: async () => {},
  }

  return (
    <LibraryScreen
      user={null}
      library={library}
      demoMode
      getAccessToken={() => Promise.reject(new Error('Not available in demo mode'))}
      onLogout={onExit}
    />
  )
}
