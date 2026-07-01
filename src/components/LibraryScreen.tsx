import { useMemo, useState } from 'react'
import { useCurate, type CuratePhase } from '../hooks/useCurate'
import type { LibraryState } from '../hooks/useLibrary'
import { addTracksToPlaylist, createPlaylist } from '../lib/spotify'
import type { AppError, CuratedTrack, SpotifyUser, Track } from '../lib/types'

interface Props {
  user: SpotifyUser | null
  library: LibraryState
  getAccessToken: () => Promise<string>
  onLogout: () => void
}

export function LibraryScreen({ user, library, getAccessToken, onLogout }: Props) {
  const { tracks, fetchedAt, loading, progress, error } = library
  const curate = useCurate(tracks)

  const uniqueArtists = new Set(tracks.flatMap((t) => t.artists)).size
  const uniqueGenres = new Set(tracks.flatMap((t) => t.genres)).size

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <span className="font-semibold text-white text-sm">🎵 Playlist Generator</span>
        <div className="flex items-center gap-4">
          {user && <span className="text-zinc-400 text-sm">{user.displayName}</span>}
          <button
            onClick={onLogout}
            className="text-zinc-500 hover:text-white text-sm transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-12">
        {loading ? (
          <LoadingState progress={progress} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void library.load(true)} />
        ) : tracks.length === 0 ? (
          <EmptyState onRefresh={() => void library.load(true)} />
        ) : curate.result ? (
          <CurateResult
            results={curate.result}
            tracks={tracks}
            vibe={curate.vibe ?? ''}
            getAccessToken={getAccessToken}
            onReset={curate.reset}
          />
        ) : (
          <LibraryStats
            tracks={tracks}
            trackCount={tracks.length}
            artistCount={uniqueArtists}
            genreCount={uniqueGenres}
            fetchedAt={fetchedAt}
            onRefresh={() => void library.load(true)}
            curating={curate.loading}
            curatePhase={curate.phase}
            curateError={curate.error}
            onCurate={(vibe) => void curate.curate(vibe)}
          />
        )}
      </main>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LoadingState({ progress }: { progress: number | null }) {
  return (
    <div className="flex flex-col items-center gap-4 text-zinc-400">
      <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm">
        {progress !== null && progress > 0
          ? `Fetching your library… ${progress} tracks so far`
          : 'Loading your library…'}
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-red-400 text-sm max-w-sm">{message}</p>
      <button
        onClick={onRetry}
        className="text-zinc-400 hover:text-white text-sm underline transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-zinc-400 text-sm">No liked songs found on this account.</p>
      <button
        onClick={onRefresh}
        className="text-zinc-400 hover:text-white text-sm underline transition-colors"
      >
        Refresh
      </button>
    </div>
  )
}

const PAGE_SIZE = 50

function LibraryStats({
  tracks,
  trackCount,
  artistCount,
  genreCount,
  fetchedAt,
  onRefresh,
  curating,
  curatePhase,
  curateError,
  onCurate,
}: {
  tracks: Track[]
  trackCount: number
  artistCount: number
  genreCount: number
  fetchedAt: number | null
  onRefresh: () => void
  curating: boolean
  curatePhase: CuratePhase | null
  curateError: AppError | null
  onCurate: (vibe: string) => void
}) {
  const [vibe, setVibe] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const cachedDate = fetchedAt ? new Date(fetchedAt).toLocaleString() : null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artists.some((a) => a.toLowerCase().includes(q))
    )
  }, [tracks, search])

  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = paginated.length < filtered.length

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = vibe.trim()
    if (trimmed) onCurate(trimmed)
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-white">Your library is ready</h2>

      <div className="flex gap-8">
        <Stat label="tracks" value={trackCount} />
        <Stat label="artists" value={artistCount} />
        {genreCount > 0 && <Stat label="genres" value={genreCount} />}
      </div>

      {cachedDate && <p className="text-zinc-600 text-xs">Cached {cachedDate}</p>}

      <button
        onClick={onRefresh}
        className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors"
      >
        Refresh library
      </button>

      <form onSubmit={handleSubmit} className="w-full flex gap-2 mt-2">
        <input
          type="text"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          placeholder="Describe a vibe… (e.g. Minecraft with the boys)"
          disabled={curating}
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={curating || !vibe.trim()}
          className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {curating ? 'Curating…' : 'Generate'}
        </button>
      </form>

      {curating && (
        <LoadingBar label={curatePhase ? PHASE_LABELS[curatePhase] : 'Working…'} />
      )}

      {curateError && <p className="text-red-400 text-sm">{curateError.message}</p>}

      {/* Song browser */}
      <div className="w-full mt-2 flex flex-col gap-3 text-left">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search songs or artists…"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />

        {search && (
          <p className="text-zinc-500 text-xs">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
        )}

        <ul className="flex flex-col gap-1">
          {paginated.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-4 px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors">
              <div className="min-w-0">
                <span className="text-white text-sm truncate block">{t.name}</span>
                <span className="text-zinc-500 text-xs truncate block">{t.artists.join(', ')}</span>
              </div>
              <span className="text-zinc-600 text-xs shrink-0">{t.year || '—'}</span>
            </li>
          ))}
        </ul>

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors self-center"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  )
}

function CurateResult({
  results,
  tracks,
  vibe,
  getAccessToken,
  onReset,
}: {
  results: CuratedTrack[]
  tracks: Track[]
  vibe: string
  getAccessToken: () => Promise<string>
  onReset: () => void
}) {
  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const [playlistName, setPlaylistName] = useState(vibe || 'My Vibe Playlist')
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const token = await getAccessToken()
      const playlistId = await createPlaylist(token, playlistName, false)
      await addTracksToPlaylist(token, playlistId, results.map((r) => r.id))
      setSavedUrl(`https://open.spotify.com/playlist/${playlistId}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save playlist')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
      <div className="flex items-center justify-between w-full">
        <h2 className="text-xl font-semibold text-white">{results.length} tracks curated</h2>
        <button
          onClick={onReset}
          className="text-zinc-500 hover:text-zinc-300 text-sm underline transition-colors"
        >
          Start over
        </button>
      </div>

      {savedUrl ? (
        <div className="w-full flex flex-col items-center gap-3 py-4">
          <p className="text-green-400 text-sm font-medium">Playlist saved to Spotify!</p>
          <a
            href={savedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
          >
            Open in Spotify
          </a>
        </div>
      ) : (
        <div className="w-full flex gap-2">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            disabled={saving}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving || !playlistName.trim()}
            className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shrink-0"
          >
            {saving ? 'Saving…' : 'Save to Spotify'}
          </button>
        </div>
      )}

      {saving && <LoadingBar label="Creating your playlist on Spotify…" />}

      {saveError && <p className="text-red-400 text-sm">{saveError}</p>}

      <ul className="w-full flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {results.map(({ id, reason }) => {
          const track = trackMap.get(id)
          return (
            <li key={id} className="flex flex-col gap-1 border border-zinc-800 rounded-lg px-4 py-3">
              <span className="text-white text-sm font-medium">{track?.name ?? id}</span>
              <span className="text-zinc-500 text-xs">
                {track?.artists.join(', ')} · {track?.year}
              </span>
              <span className="text-zinc-400 text-xs italic">{reason}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const PHASE_LABELS: Record<CuratePhase, string> = {
  matching: 'Finding matches in your library…',
  enriching: 'Reading genres…',
  curating: 'Curating with AI — this takes a few seconds…',
}

// Indeterminate bar: a slice sweeps across the track. Honest for LLM/network
// waits where a real percentage is unknowable.
function LoadingBar({ label }: { label?: string }) {
  return (
    <div className="w-full flex flex-col gap-2">
      {label && <span className="text-zinc-400 text-xs text-center">{label}</span>}
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-green-500 animate-[indeterminate-slide_1.3s_ease-in-out_infinite]" />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-3xl font-bold text-white">{value.toLocaleString()}</span>
      <span className="text-zinc-500 text-xs uppercase tracking-wider">{label}</span>
    </div>
  )
}
