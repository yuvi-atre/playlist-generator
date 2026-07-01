import type { SpotifyTokens, SpotifyUser, Track } from './types'

const KEYS = {
  tokens: 'pg_tokens',
  user: 'pg_user',
  library: 'pg_library_v2', // v2: adds albumArt; bump invalidates art-less caches
} as const

interface LibraryCache {
  tracks: Track[]
  fetchedAt: number
}

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function remove(key: string): void {
  localStorage.removeItem(key)
}

export const storage = {
  tokens: {
    get: () => get<SpotifyTokens>(KEYS.tokens),
    set: (v: SpotifyTokens) => set(KEYS.tokens, v),
    clear: () => remove(KEYS.tokens),
  },
  user: {
    get: () => get<SpotifyUser>(KEYS.user),
    set: (v: SpotifyUser) => set(KEYS.user, v),
    clear: () => remove(KEYS.user),
  },
  library: {
    get: () => get<LibraryCache>(KEYS.library),
    set: (tracks: Track[]) => set<LibraryCache>(KEYS.library, { tracks, fetchedAt: Date.now() }),
    clear: () => remove(KEYS.library),
  },
  clearAll: () => Object.values(KEYS).forEach(remove),
}
