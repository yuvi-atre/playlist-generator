export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
export const SPOTIFY_REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:5173/callback'

// ugc-image-upload: custom playlist covers. Added 2026-07-01 — tokens issued
// before then lack it; cover upload degrades gracefully until the next login.
export const SPOTIFY_SCOPES = ['user-library-read', 'playlist-modify-private', 'ugc-image-upload']

export const LIBRARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

export const LASTFM_API_KEY = import.meta.env.VITE_LASTFM_API_KEY ?? ''
