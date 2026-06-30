export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
export const SPOTIFY_REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:5173/callback'

export const SPOTIFY_SCOPES = ['user-library-read', 'playlist-modify-private']

export const LIBRARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 h
