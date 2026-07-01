const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0'
const CACHE_KEY = 'lastfm_genre_cache'
const CONCURRENCY = 5
// Tags that are user sentiment, not genres
const SKIP_TAGS = new Set(['seen live', 'favourite', 'favorites', 'love', 'awesome', 'beautiful', 'amazing'])

type GenreCache = Record<string, string[]>

function loadCache(): GenreCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as GenreCache
  } catch {
    return {}
  }
}

function saveCache(cache: GenreCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full — not critical
  }
}

export async function fetchArtistGenres(
  artistNames: string[],
  apiKey: string
): Promise<Map<string, string[]>> {
  if (!apiKey) return new Map()

  const cache = loadCache()
  const result = new Map<string, string[]>()
  const uncached: string[] = []

  for (const name of artistNames) {
    if (cache[name] !== undefined) {
      result.set(name, cache[name])
    } else {
      uncached.push(name)
    }
  }

  for (let i = 0; i < uncached.length; i += CONCURRENCY) {
    const batch = uncached.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (name) => {
        try {
          const url = `${LASTFM_BASE}/?method=artist.getTopTags&artist=${encodeURIComponent(name)}&api_key=${apiKey}&format=json`
          const res = await fetch(url)
          if (!res.ok) {
            cache[name] = []
            return
          }
          const data = (await res.json()) as {
            error?: number
            toptags?: { tag: Array<{ name: string; count: number }> }
          }
          if (data.error) {
            cache[name] = []
            return
          }
          const tags = (data.toptags?.tag ?? [])
            .slice(0, 8)
            .map((t) => t.name.toLowerCase())
            .filter((t) => !SKIP_TAGS.has(t))
            .slice(0, 5)
          cache[name] = tags
          result.set(name, tags)
        } catch {
          cache[name] = []
        }
      })
    )
  }

  saveCache(cache)
  return result
}
