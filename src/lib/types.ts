// Core domain types — keep in sync with PRD §10

export interface Track {
  id: string
  name: string
  artists: string[]
  album: string
  albumArt: string | null // small (~64px) album cover URL (display only, comes free in /me/tracks)
  albumArtLarge: string | null // ~300px album cover URL — used for the playlist-cover mosaic
  genres: string[]
  year: number
  popularity: number
  addedAt: string
}

// ── Spotify API shapes ────────────────────────────────────────────────────────

export interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

export interface SpotifyUser {
  id: string
  displayName: string
  imageUrl: string | null
}

// Raw shape from GET /me/tracks (one item in the `items` array)
export interface SpotifySavedTrackItem {
  added_at: string
  track: {
    id: string
    name: string
    popularity: number
    album: {
      name: string
      release_date: string
      images: Array<{ url: string; width: number; height: number }>
    }
    artists: Array<{ id: string; name: string }>
  }
}

// Raw shape from GET /artists (batch)
export interface SpotifyArtist {
  id: string
  genres: string[]
  popularity: number
}

// ── Claude curation API shapes ────────────────────────────────────────────────

// Playlist length target — maps to a candidate count range in api/curate.ts.
export type PlaylistLength = 'short' | 'medium' | 'long'

// User-set filters applied as HARD gates in preFilter before scoring (except
// `length`, which is forwarded to the LLM). Empty arrays / null mean "no filter".
export interface CurateFilters {
  includeGenres: string[] // if non-empty, candidate must match ≥1 (substring, case-insensitive)
  excludeGenres: string[] // candidate matching any is dropped
  includeArtists: string[] // if non-empty, restrict to these artists; also cap-exempt + boosted
  excludeArtists: string[] // tracks by these artists are dropped
  decades: number[] // decade start years (e.g. 1990); if non-empty, track year must fall in one
  length: PlaylistLength
}

export const DEFAULT_FILTERS: CurateFilters = {
  includeGenres: [],
  excludeGenres: [],
  includeArtists: [],
  excludeArtists: [],
  decades: [],
  length: 'medium',
}

// Haiku vibe-expansion: turns a free-text vibe into a full interpretation so
// off-dictionary vibes ("rainy Tokyo rooftop") still produce real signals.
// genres/avoidGenres/decades drive the local pre-filter; summary/moods/energy
// are forwarded to the Sonnet curation pass so both stages share one reading.
export interface VibeExpansion {
  summary: string // one-sentence interpretation of the vibe
  genres: string[] // lowercase genre keywords added to preFilter's genre matching
  avoidGenres: string[] // genres that would clash — scored as a penalty in preFilter
  moods: string[] // lowercase mood adjectives (e.g. "wistful", "triumphant")
  energy: 'low' | 'medium' | 'high' | 'mixed'
  decades: number[] // decade start years (e.g. 1990) → soft era scoring ranges
}

// What we POST to /api/curate
export interface CurateRequest {
  vibe: string
  candidates: CandidateTrack[]
  length?: PlaylistLength
  // The Haiku interpretation, forwarded so the curation prompt shares the same
  // reading of the vibe that shaped the candidate pool. Optional — curation
  // works from the raw vibe alone if expansion failed.
  interpretation?: {
    summary: string
    moods: string[]
    energy: string
  }
}

// Lean candidate payload sent to the LLM (no full Track to keep token count down)
export interface CandidateTrack {
  id: string
  name: string
  artists: string[]
  genres: string[]
  year: number
}

// What Claude returns (strict JSON — parse defensively)
export interface CurateResponse {
  tracks: CuratedTrack[]
  playlistName?: string // Claude-suggested title — prefills the save input
  curatorNote?: string // 1–2 sentence note on the playlist's shape/arc
}

export interface CuratedTrack {
  id: string
  reason: string
}

// ── App state ─────────────────────────────────────────────────────────────────

export type AppScreen = 'login' | 'library' | 'chat' | 'review'

export interface AppError {
  code: 'token_expired' | 'empty_results' | 'rate_limit' | 'api_error' | 'unknown'
  message: string
}
