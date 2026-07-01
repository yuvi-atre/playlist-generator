import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from './config'
import type { SpotifyArtist, SpotifySavedTrackItem, SpotifyTokens, SpotifyUser, Track } from './types'

const ACCOUNTS_BASE = 'https://accounts.spotify.com'
const API_BASE = 'https://api.spotify.com/v1'

// Refresh 5 minutes before actual expiry to avoid mid-request failures
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

// ── Auth ──────────────────────────────────────────────────────────────────────

export function buildAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    scope: SPOTIFY_SCOPES.join(' '),
    show_dialog: 'true',
  })
  return `${ACCOUNTS_BASE}/authorize?${params}`
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<SpotifyTokens> {
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`)
  return parseTokenResponse(await res.json())
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`)
  const data = await res.json()
  // Spotify may or may not return a new refresh token — keep the old one if absent
  return parseTokenResponse({ ...data, refresh_token: data.refresh_token ?? refreshToken })
}

export function isExpired(tokens: SpotifyTokens): boolean {
  return Date.now() >= tokens.expiresAt - EXPIRY_BUFFER_MS
}

// ── User ──────────────────────────────────────────────────────────────────────

export async function fetchCurrentUser(accessToken: string): Promise<SpotifyUser> {
  const data = await apiGet<{
    id: string
    display_name: string
    images: Array<{ url: string }>
  }>('/me', accessToken)
  return {
    id: data.id,
    displayName: data.display_name,
    imageUrl: data.images?.[0]?.url ?? null,
  }
}

// ── Library fetch ─────────────────────────────────────────────────────────────

export async function fetchAllLikedSongs(
  accessToken: string,
  onProgress?: (fetched: number) => void
): Promise<SpotifySavedTrackItem[]> {
  const LIMIT = 50
  const PAGE_CONCURRENCY = 5
  type Page = { items: SpotifySavedTrackItem[]; next: string | null; total: number }

  // First page tells us the total, so the rest can be fetched in parallel by
  // offset instead of chaining `next` one request at a time.
  const first = await apiGetUrl<Page>(`${API_BASE}/me/tracks?limit=${LIMIT}&offset=0`, accessToken)
  const results: SpotifySavedTrackItem[] = [...first.items]
  let fetched = first.items.length
  onProgress?.(fetched)
  if (fetched >= first.total) return results

  const offsets: number[] = []
  for (let o = LIMIT; o < first.total; o += LIMIT) offsets.push(o)

  const pages: SpotifySavedTrackItem[][] = new Array(offsets.length)
  let cursor = 0
  async function worker() {
    while (cursor < offsets.length) {
      const i = cursor++
      const page = await apiGetUrl<Page>(
        `${API_BASE}/me/tracks?limit=${LIMIT}&offset=${offsets[i]}`,
        accessToken
      )
      pages[i] = page.items
      fetched += page.items.length
      onProgress?.(fetched)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, offsets.length) }, worker)
  )

  for (const p of pages) results.push(...p) // offset order preserved
  return results
}

// Spotify /artists accepts up to 50 IDs per request
export async function fetchArtistsBatch(
  accessToken: string,
  artistIds: string[]
): Promise<Map<string, SpotifyArtist>> {
  const map = new Map<string, SpotifyArtist>()

  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50)
    const data = await apiGet<{ artists: Array<SpotifyArtist | null> }>(
      `/artists?ids=${batch.join(',')}`,
      accessToken
    )
    for (const artist of data.artists) {
      if (artist) map.set(artist.id, artist)
    }
  }

  return map
}

export function buildLibrary(
  savedTracks: SpotifySavedTrackItem[],
  artistMap: Map<string, SpotifyArtist>
): Track[] {
  return savedTracks
    .filter((item) => item.track?.id) // guard against null tracks (e.g. local files)
    .map((item) => {
      const primaryArtistId = item.track.artists[0]?.id ?? ''
      const genres = artistMap.get(primaryArtistId)?.genres ?? []
      const year = parseInt(item.track.album.release_date.slice(0, 4), 10)
      // images are ordered largest→smallest; the smallest (~64px) suits a thumbnail
      const images = item.track.album.images
      const albumArt = images.length ? images[images.length - 1].url : null

      return {
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map((a) => a.name),
        album: item.track.album.name,
        albumArt,
        genres,
        year: isNaN(year) ? 0 : year,
        popularity: item.track.popularity,
        addedAt: item.added_at,
      }
    })
}

// ── Playlist creation (used in step 6) ───────────────────────────────────────

// Spotify's Feb 2026 API migration removed POST /users/{id}/playlists for
// Development Mode apps (403 after 2026-03-09). Use POST /me/playlists instead.
export async function createPlaylist(
  accessToken: string,
  name: string,
  isPublic: boolean
): Promise<string> {
  const data = await apiPost<{ id: string }>(`/me/playlists`, accessToken, {
    name,
    public: isPublic,
    description: 'Generated by Playlist Generator',
  })
  return data.id
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackIds: string[]
): Promise<void> {
  // Spotify accepts up to 100 URIs per request. The Feb 2026 API migration
  // renamed POST /playlists/{id}/tracks → /items (old path 403s in Dev Mode).
  for (let i = 0; i < trackIds.length; i += 100) {
    const uris = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`)
    await apiPost(`/playlists/${playlistId}/items`, accessToken, { uris })
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  return apiGetUrl(`${API_BASE}${path}`, accessToken)
}

async function apiGetUrl<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10)
    await sleep(retryAfter * 1000)
    return apiGetUrl(url, accessToken)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)')
    console.error(`Spotify API ${res.status} ${url}\n${body}`)
    throw new Error(`Spotify API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '(unreadable)')
    console.error(`Spotify API ${res.status} POST ${path}\n${errBody}`)
    throw new Error(`Spotify API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

function parseTokenResponse(data: {
  access_token: string
  refresh_token: string
  expires_in: number
}): SpotifyTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
