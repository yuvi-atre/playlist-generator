import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useCurate, type CuratePhase } from '../hooks/useCurate'
import {
  RobotHero,
  RobotTyping,
  CuratedVisualizer,
  PlaylistSuccess,
  SuccessCheck,
} from './RobotMascot'
import { LASTFM_API_KEY } from '../lib/config'
import { fetchArtistGenres } from '../lib/lastfm'
import { canonicalizeGenres } from '../lib/genres'
import type { LibraryState } from '../hooks/useLibrary'
import { addTracksToPlaylist, createPlaylist } from '../lib/spotify'
import { DEFAULT_FILTERS } from '../lib/types'
import type {
  AppError,
  CurateFilters,
  CuratedTrack,
  PlaylistLength,
  SpotifyUser,
  Track,
} from '../lib/types'

interface Props {
  user: SpotifyUser | null
  library: LibraryState
  getAccessToken: () => Promise<string>
  onLogout: () => void
}

export function LibraryScreen({ user, library, getAccessToken, onLogout }: Props) {
  const { tracks, fetchedAt, loading, progress, error } = library
  // Show the hero landing first; the prompt view is revealed on "Get Started".
  const [started, setStarted] = useState(false)

  const uniqueArtists = new Set(tracks.flatMap((t) => t.artists)).size

  // Genres come from Last.fm (Spotify /v1/artists 403s). Enrich the full library in the
  // BACKGROUND after the list has rendered — never blocks the UI; cached in localStorage.
  const [libGenres, setLibGenres] = useState<Map<string, string[]>>(new Map())
  useEffect(() => {
    if (!tracks.length) return
    let cancelled = false
    const artists = [...new Set(tracks.map((t) => t.artists[0]).filter(Boolean))]
    void fetchArtistGenres(artists, LASTFM_API_KEY)
      .then((map) => {
        if (!cancelled) setLibGenres(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tracks])
  // How many artists a genre must tag to count as "real" — drops the long tail of
  // one-off tags (stray artist names, memes, typos) that Last.fm leaves behind.
  const MIN_GENRE_ARTISTS = 2

  // Canonicalize tags (collapses variants, drops non-genre tags) and count how many
  // artists carry each genre — shared by the stat and the filter chips.
  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const genres of libGenres.values()) {
      for (const g of canonicalizeGenres(genres)) counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    return counts
  }, [libGenres])

  // Stat: only genres that characterize the library (>= MIN_GENRE_ARTISTS artists).
  const uniqueGenres = useMemo(
    () => [...genreCounts.values()].filter((n) => n >= MIN_GENRE_ARTISTS).length,
    [genreCounts]
  )

  // Chips: same threshold, top 30 by frequency. (Artist autocomplete uses the raw list.)
  const genreOptions = useMemo(
    () =>
      [...genreCounts.entries()]
        .filter(([, n]) => n >= MIN_GENRE_ARTISTS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([g]) => g),
    [genreCounts]
  )

  const artistOptions = useMemo(
    () => [...new Set(tracks.flatMap((t) => t.artists))].sort((a, b) => a.localeCompare(b)),
    [tracks]
  )

  // Merge background-enriched genres onto tracks so the pre-filter's genre signal actually
  // fires (Spotify leaves track.genres empty). Uses whatever's cached/loaded at curate time;
  // useCurate's post-filter pass backfills any candidate genres still missing on a cold start.
  const enrichedTracks = useMemo(
    () =>
      libGenres.size === 0
        ? tracks
        : tracks.map((t) =>
            t.genres.length ? t : { ...t, genres: libGenres.get(t.artists[0]) ?? [] }
          ),
    [tracks, libGenres]
  )
  const curate = useCurate(enrichedTracks)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <span className="flex items-center gap-2 font-semibold text-white text-sm">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="w-5 h-5" />
          Playlist Generator
        </span>
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
            tracks={enrichedTracks}
            vibe={curate.vibe ?? ''}
            genresByTrack={curate.genresByTrack}
            getAccessToken={getAccessToken}
            onReset={curate.reset}
          />
        ) : !started ? (
          <GetStartedHero trackCount={tracks.length} onStart={() => setStarted(true)} />
        ) : (
          <LibraryStats
            tracks={enrichedTracks}
            trackCount={tracks.length}
            artistCount={uniqueArtists}
            genreCount={uniqueGenres}
            fetchedAt={fetchedAt}
            onRefresh={() => void library.load(true)}
            curating={curate.loading}
            curatePhase={curate.phase}
            curateError={curate.error}
            genreOptions={genreOptions}
            artistOptions={artistOptions}
            onCurate={(vibe, filters) => void curate.curate(vibe, filters)}
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
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ease-out-quart per the Impeccable motion spec: transform + opacity only.
const EASE_QUART = 'ease-[cubic-bezier(0.165,0.84,0.44,1)]'

// Album cover thumbnail. Comes free in the /me/tracks payload (no extra API call).
// Lazy-loaded; reveals via opacity + scale; equalizer glyph as fallback.
function AlbumArt({ url, size = 44 }: { url: string | null; size?: number }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const showImg = url && !errored

  return (
    <div
      className="shrink-0 overflow-hidden rounded-md bg-zinc-800 ring-1 ring-white/5"
      style={{ width: size, height: size }}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition duration-300 ${EASE_QUART} motion-reduce:transition-none`}
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? 'scale(1)' : 'scale(0.97)' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor" aria-hidden="true">
            <rect x="4" y="10" width="3" height="10" rx="1.5" />
            <rect x="10" y="5" width="3" height="15" rx="1.5" />
            <rect x="16" y="8" width="3" height="12" rx="1.5" />
          </svg>
        </div>
      )}
    </div>
  )
}

// Branded banner (Claude-design) — robot + wordmark + live equalizer. Anchors the
// left column of the library workspace.
function BrandBanner() {
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 18% 50%, rgba(34,197,94,0.18), transparent 65%)',
        }}
      />
      <RobotHero className="relative w-16 h-auto shrink-0" />
      <div className="relative flex flex-col gap-1.5">
        <span className="text-lg font-semibold leading-tight text-white">Playlist Generator</span>
        <span className="text-xs text-zinc-500">vibe-curated from your liked songs</span>
        <div className="mt-1 flex items-end gap-1 h-4">
          {[7, 14, 10, 16, 9].map((h, i) => (
            <div
              key={i}
              className="robot-eq w-1 rounded-full bg-green-500"
              style={{ height: h, animationDelay: `${-0.3 * i}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Landing hero shown once the library is ready. "Get Started" swipes the hero
// up and out, then LibraryStats slides up into place.
function GetStartedHero({ trackCount, onStart }: { trackCount: number; onStart: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return
      gsap.from(ref.current.children, {
        y: 16,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        stagger: 0.08,
      })
    },
    { scope: ref }
  )

  const handleStart = () => {
    if (prefersReducedMotion() || !ref.current) {
      onStart()
      return
    }
    gsap.to(ref.current, {
      y: -60,
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: onStart,
    })
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-5 text-center">
      <RobotHero className="w-40 h-auto" />
      <h2 className="text-3xl font-semibold tracking-tight text-white">Playlist Generator</h2>
      <p className="text-zinc-400 max-w-sm text-sm leading-relaxed">
        {trackCount.toLocaleString()} liked songs ready. Describe a vibe and get a curated playlist
        pulled straight from your library.
      </p>
      <button
        onClick={handleStart}
        className="mt-1 rounded-full bg-green-600 hover:bg-green-500 px-8 py-3 text-sm font-semibold
                   text-white transition-colors"
      >
        Get Started
      </button>
    </div>
  )
}

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
  genreOptions,
  artistOptions,
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
  genreOptions: string[]
  artistOptions: string[]
  onCurate: (vibe: string, filters: CurateFilters) => void
}) {
  const [vibe, setVibe] = useState('')
  const [vibeFocused, setVibeFocused] = useState(false)
  const [filters, setFilters] = useState<CurateFilters>(DEFAULT_FILTERS)
  const [search, setSearch] = useState('')
  const showBot = vibeFocused || vibe.trim().length > 0 || curating
  const cachedDate = fetchedAt ? new Date(fetchedAt).toLocaleString() : null

  // Slide up into place after the hero swipes away.
  const rootRef = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (prefersReducedMotion() || !rootRef.current) return
      gsap.from(rootRef.current, { y: 50, opacity: 0, duration: 0.5, ease: 'power3.out' })
    },
    { scope: rootRef }
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter(
      (t) => t.name.toLowerCase().includes(q) || t.artists.some((a) => a.toLowerCase().includes(q))
    )
  }, [tracks, search])

  // Sync the right column's height to the left column's actual rendered height
  // (lg+ only, where they sit side by side) — so opening/closing Filters grows
  // or shrinks the song list to match, instead of the panel floating or being
  // independently capped. Falls back to the default vh-based cap below `lg` or
  // before the first measurement.
  const leftColRef = useRef<HTMLDivElement>(null)
  const [syncedHeight, setSyncedHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = leftColRef.current
    if (!el) return
    const update = () => {
      setSyncedHeight(window.matchMedia('(min-width: 1024px)').matches ? el.offsetHeight : null)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = vibe.trim()
    if (trimmed) onCurate(trimmed, filters)
  }

  return (
    <div
      ref={rootRef}
      className="w-full max-w-7xl grid gap-12 lg:grid-cols-[26rem_1fr] items-start"
    >
      {/* LEFT: library info + vibe prompt (sticky on desktop) */}
      <div ref={leftColRef} className="flex flex-col gap-6 lg:sticky lg:top-6">
        <div className="flex flex-col gap-4 text-center lg:text-left">
          <h2 className="text-2xl font-semibold text-white">Your library is ready</h2>

          <div className="flex gap-8 justify-center lg:justify-start">
            <Stat label="tracks" value={trackCount} />
            <Stat label="artists" value={artistCount} />
            {genreCount > 0 && <Stat label="genres" value={genreCount} />}
          </div>

          <div className="flex flex-col items-center lg:items-start gap-1">
            {cachedDate && <p className="text-zinc-600 text-xs">Cached {cachedDate}</p>}
            <button
              onClick={onRefresh}
              className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors"
            >
              Refresh library
            </button>
          </div>
        </div>

        <BrandBanner />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <RobotTyping
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 transition-opacity duration-200 ${
                showBot ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <input
              type="text"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              onFocus={() => setVibeFocused(true)}
              onBlur={() => setVibeFocused(false)}
              placeholder="Describe a vibe… (e.g. Minecraft with the boys)"
              disabled={curating}
              className={`w-full rounded-xl border border-zinc-700 bg-zinc-900 py-4 text-base text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50 transition-all ${
                showBot ? 'pl-12 pr-4' : 'px-4'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={curating || !vibe.trim()}
            className="w-full px-5 py-4 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-semibold transition-colors"
          >
            {curating ? 'Curating…' : 'Generate'}
          </button>
        </form>

        {curating && <LoadingBar label={curatePhase ? PHASE_LABELS[curatePhase] : 'Working…'} />}

        {curateError && (
          <p className="text-red-400 text-sm text-center lg:text-left">{curateError.message}</p>
        )}

        {/* Filters last: collapsed by default, so it can't push the Generate button
            or the brand card off-screen. Expanding it grows the left column's real
            height, which the right song list mirrors (see syncedHeight above). */}
        <FiltersPanel
          filters={filters}
          onChange={setFilters}
          genreOptions={genreOptions}
          artistOptions={artistOptions}
          disabled={curating}
        />
      </div>

      {/* RIGHT: song browser — bounded scroll pane */}
      <div className="flex flex-col gap-3 min-w-0 text-left">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs or artists…"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />

        {search && (
          <p className="text-zinc-500 text-xs">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        <ul
          className="custom-scrollbar flex flex-col gap-1 overflow-y-auto pr-2 max-h-[70vh] lg:max-h-[calc(100vh-11rem)]"
          style={syncedHeight ? { maxHeight: syncedHeight } : undefined}
        >
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors"
            >
              <AlbumArt url={t.albumArt} size={36} />
              <div className="min-w-0 flex-1">
                <span className="text-white text-sm truncate block">{t.name}</span>
                <span className="text-zinc-500 text-xs truncate block">{t.artists.join(', ')}</span>
              </div>
              <span className="text-zinc-600 text-xs shrink-0">{t.year || '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Filters panel ──────────────────────────────────────────────────────────────

const LENGTH_OPTIONS: Array<{ value: PlaylistLength; label: string; hint: string }> = [
  { value: 'short', label: 'Short', hint: '~15' },
  { value: 'medium', label: 'Medium', hint: '~25' },
  { value: 'long', label: 'Long', hint: '~45' },
]

const DECADE_OPTIONS: Array<{ start: number; label: string }> = [
  { start: 1960, label: '60s' },
  { start: 1970, label: '70s' },
  { start: 1980, label: '80s' },
  { start: 1990, label: '90s' },
  { start: 2000, label: '00s' },
  { start: 2010, label: '10s' },
  { start: 2020, label: '20s' },
]

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

function FiltersPanel({
  filters,
  onChange,
  genreOptions,
  artistOptions,
  disabled,
}: {
  filters: CurateFilters
  onChange: (f: CurateFilters) => void
  genreOptions: string[]
  artistOptions: string[]
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)

  const gateCount =
    filters.includeGenres.length +
    filters.excludeGenres.length +
    filters.includeArtists.length +
    filters.excludeArtists.length +
    filters.decades.length

  // Genre chips cycle neutral → include → exclude → neutral.
  const cycleGenre = (g: string) => {
    if (filters.includeGenres.includes(g)) {
      onChange({
        ...filters,
        includeGenres: filters.includeGenres.filter((x) => x !== g),
        excludeGenres: [...filters.excludeGenres, g],
      })
    } else if (filters.excludeGenres.includes(g)) {
      onChange({ ...filters, excludeGenres: filters.excludeGenres.filter((x) => x !== g) })
    } else {
      onChange({ ...filters, includeGenres: [...filters.includeGenres, g] })
    }
  }

  const clearAll = () => onChange({ ...DEFAULT_FILTERS, length: filters.length })

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          Filters
          {gateCount > 0 && (
            <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {gateCount}
            </span>
          )}
        </span>
        <span className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-zinc-800 px-4 py-4">
          {/* Length */}
          <div className="flex flex-col gap-2">
            <FilterLabel>Playlist length</FilterLabel>
            <div className="flex gap-1.5">
              {LENGTH_OPTIONS.map((opt) => {
                const active = filters.length === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...filters, length: opt.value })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                      active
                        ? 'border-green-500 bg-green-500/10 text-green-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {opt.label}
                    <span className="ml-1 text-zinc-600">{opt.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Decades */}
          <div className="flex flex-col gap-2">
            <FilterLabel>Decades</FilterLabel>
            <div className="flex flex-wrap gap-1.5">
              {DECADE_OPTIONS.map((d) => {
                const active = filters.decades.includes(d.start)
                return (
                  <button
                    key={d.start}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ ...filters, decades: toggle(filters.decades, d.start) })
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-green-500 bg-green-500/10 text-green-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Genres */}
          <div className="flex flex-col gap-2">
            <FilterLabel>
              Genres
              <span className="ml-2 font-normal normal-case text-zinc-500">
                tap <span className="text-green-400">＋include</span>, again{' '}
                <span className="text-red-400">－exclude</span>
              </span>
            </FilterLabel>
            {genreOptions.length === 0 ? (
              <p className="text-xs text-zinc-600">Loading genres from your library…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {genreOptions.map((g) => {
                  const inc = filters.includeGenres.includes(g)
                  const exc = filters.excludeGenres.includes(g)
                  return (
                    <button
                      key={g}
                      type="button"
                      disabled={disabled}
                      onClick={() => cycleGenre(g)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        inc
                          ? 'border-green-500 bg-green-500/10 text-green-300'
                          : exc
                            ? 'border-red-500 bg-red-500/10 text-red-300'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {inc && <span className="mr-0.5 font-semibold">＋</span>}
                      {exc && <span className="mr-0.5 font-semibold">－</span>}
                      <span className={exc ? 'line-through' : ''}>{g}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Artists */}
          <ArtistPicker
            label="Only these artists"
            accent="green"
            options={artistOptions}
            selected={filters.includeArtists}
            disabled={disabled}
            onAdd={(name) =>
              onChange({
                ...filters,
                includeArtists: [...new Set([...filters.includeArtists, name])],
              })
            }
            onRemove={(name) =>
              onChange({
                ...filters,
                includeArtists: filters.includeArtists.filter((x) => x !== name),
              })
            }
          />
          <ArtistPicker
            label="Never these artists"
            accent="red"
            options={artistOptions}
            selected={filters.excludeArtists}
            disabled={disabled}
            onAdd={(name) =>
              onChange({
                ...filters,
                excludeArtists: [...new Set([...filters.excludeArtists, name])],
              })
            }
            onRemove={(name) =>
              onChange({
                ...filters,
                excludeArtists: filters.excludeArtists.filter((x) => x !== name),
              })
            }
          />

          {gateCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="self-start text-xs text-zinc-500 underline transition-colors hover:text-zinc-300"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{children}</span>
  )
}

function ArtistPicker({
  label,
  accent,
  options,
  selected,
  disabled,
  onAdd,
  onRemove,
}: {
  label: string
  accent: 'green' | 'red'
  options: string[]
  selected: string[]
  disabled: boolean
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}) {
  const [query, setQuery] = useState('')

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return options.filter((a) => a.toLowerCase().includes(q) && !selected.includes(a)).slice(0, 6)
  }, [query, options, selected])

  const chipClass =
    accent === 'green'
      ? 'border-green-500 bg-green-500/10 text-green-300'
      : 'border-red-500 bg-red-500/10 text-red-300'

  return (
    <div className="flex flex-col gap-2">
      <FilterLabel>{label}</FilterLabel>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${chipClass}`}
            >
              {name}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(name)}
                aria-label={`Remove ${name}`}
                className="opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Type an artist…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        />
        {suggestions.length > 0 && (
          <ul className="custom-scrollbar absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(name)
                    setQuery('')
                  }}
                  className="block w-full truncate px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CurateResult({
  results,
  tracks,
  vibe,
  genresByTrack,
  getAccessToken,
  onReset,
}: {
  results: CuratedTrack[]
  tracks: Track[]
  vibe: string
  genresByTrack: Map<string, string[]>
  getAccessToken: () => Promise<string>
  onReset: () => void
}) {
  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const genreCount = useMemo(
    () => new Set(results.flatMap((r) => genresByTrack.get(r.id) ?? [])).size,
    [results, genresByTrack]
  )
  const listRef = useRef<HTMLUListElement>(null)
  const [playlistName, setPlaylistName] = useState(vibe || 'My Vibe Playlist')

  // Stagger the curated result cards in. Respects reduced-motion.
  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (!listRef.current) return
      // Only stagger the first dozen (roughly the visible ones). Animating every
      // card set them all to opacity:0 up front, so a long list read as a dark
      // fade where lower cards never became legible. clearProps strips the inline
      // styles on finish so nothing can stay stuck transparent.
      const cards = Array.from(listRef.current.children).slice(0, 12)
      gsap.from(cards, {
        opacity: 0,
        y: 8,
        duration: 0.3,
        ease: 'expo.out',
        stagger: 0.03,
        clearProps: 'opacity,transform',
      })
    },
    { scope: listRef, dependencies: [results] }
  )
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'copied'>('idle')

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const token = await getAccessToken()
      const playlistId = await createPlaylist(token, playlistName, false)
      await addTracksToPlaylist(
        token,
        playlistId,
        results.map((r) => r.id)
      )
      setSavedUrl(`https://open.spotify.com/playlist/${playlistId}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save playlist')
    } finally {
      setSaving(false)
    }
  }

  // Native share sheet on mobile (iMessage, AirDrop, …); clipboard fallback on desktop.
  async function handleShare() {
    if (!savedUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: playlistName || 'Playlist',
          text: `Check out "${playlistName}" — a playlist I curated`,
          url: savedUrl,
        })
        setShareStatus('shared')
      } catch {
        return // user dismissed the share sheet — leave the label unchanged
      }
    } else {
      try {
        await navigator.clipboard.writeText(savedUrl)
        setShareStatus('copied')
      } catch {
        setSaveError('Could not copy the link — use "Open in Spotify" and copy from there.')
        return
      }
    }
    setTimeout(() => setShareStatus('idle'), 2000)
  }

  return (
    <div className="w-full max-w-7xl grid gap-12 lg:grid-cols-[26rem_1fr] items-start">
      {/* LEFT: summary + save (sticky on desktop) */}
      <div className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div className="flex flex-col gap-1 text-center lg:text-left">
          <h2 className="text-2xl font-semibold text-white">{results.length} tracks curated</h2>
          {vibe && <p className="text-zinc-500 text-sm truncate">for “{vibe}”</p>}
          {genreCount > 0 && (
            <p className="text-zinc-600 text-xs">
              spanning {genreCount} genre{genreCount !== 1 ? 's' : ''}
            </p>
          )}
          <button
            onClick={onReset}
            className="mt-1 self-center lg:self-start text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors"
          >
            Start over
          </button>
        </div>

        {savedUrl ? (
          <div className="success-card flex flex-col items-center lg:items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <PlaylistSuccess />
            <div className="success-row flex items-center gap-2">
              <SuccessCheck />
              <p className="text-white text-sm font-semibold">Playlist saved to Spotify!</p>
            </div>
            <div className="flex gap-2">
              <a
                href={savedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-base font-semibold transition-colors"
              >
                Open in Spotify
              </a>
              <button
                onClick={() => void handleShare()}
                className="px-5 py-3.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-white text-base font-semibold transition-colors"
              >
                {shareStatus === 'copied'
                  ? 'Link copied!'
                  : shareStatus === 'shared'
                    ? 'Shared!'
                    : 'Share'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-base text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
            <button
              onClick={() => void handleSave()}
              disabled={saving || !playlistName.trim()}
              className="w-full px-5 py-4 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Save to Spotify'}
            </button>
          </div>
        )}

        {saving && <LoadingBar label="Creating your playlist on Spotify…" />}

        {saveError && <p className="text-red-400 text-sm text-center lg:text-left">{saveError}</p>}

        {/* Pre-save "vibing" mascot. Once saved, PlaylistSuccess (above, inside
            the savedUrl branch) takes over the mascot role -- showing both
            read as two redundant cards stacked on top of each other. */}
        {!savedUrl && <CuratedVisualizer />}
      </div>

      {/* RIGHT: curated cards — bounded scroll pane */}
      <ul
        ref={listRef}
        className="custom-scrollbar w-full flex flex-col gap-2 min-w-0 overflow-y-auto pr-2 max-h-[70vh] lg:max-h-[calc(100vh-9rem)]"
      >
        {results.map(({ id, reason }, i) => {
          const track = trackMap.get(id)
          return (
            <li
              key={id}
              className={`group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 transition duration-200 ${EASE_QUART} hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-800 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
            >
              <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-zinc-600">
                {i + 1}
              </span>
              <AlbumArt url={track?.albumArt ?? null} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {track?.name ?? id}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {track?.artists.join(', ')} · {track?.year}
                </span>
                {(genresByTrack.get(id) ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(genresByTrack.get(id) ?? []).slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] leading-tight text-zinc-400"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                {reason && (
                  <p className="mt-1.5 border-l-2 border-zinc-700 pl-2 text-xs italic text-zinc-400">
                    {reason}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const PHASE_LABELS: Record<CuratePhase, string> = {
  expanding: 'Understanding your vibe…',
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
  const numRef = useRef<HTMLSpanElement>(null)

  // Count up from 0 to the real value. Reduced-motion shows the final number instantly.
  useGSAP(
    () => {
      const el = numRef.current
      if (!el) return
      if (prefersReducedMotion() || value === 0) {
        el.textContent = value.toLocaleString()
        return
      }
      const counter = { v: 0 }
      gsap.to(counter, {
        v: value,
        duration: 1.1,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = Math.round(counter.v).toLocaleString()
        },
      })
    },
    { dependencies: [value] }
  )

  return (
    <div className="flex flex-col items-center gap-1">
      <span ref={numRef} className="text-3xl font-bold text-white tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-zinc-500 text-xs uppercase tracking-wider">{label}</span>
    </div>
  )
}
