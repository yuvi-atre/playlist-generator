import { canonicalizeGenre } from './genres'
import type { CandidateTrack, CurateFilters, Track, VibeExpansion } from './types'

const MAX_CANDIDATES = 150
// Pass-1 shortlist size for the two-pass select in useCurate: wide enough that
// genre enrichment can meaningfully re-rank, small enough to keep Last.fm calls sane.
export const SHORTLIST_SIZE = 300
const INCLUDE_ARTIST_BOOST = 8 // #1 adaptive cap: rank an explicitly-included artist's tracks high

// ── Scoring knobs (tune these) ────────────────────────────────────────────────
// STRONG keywords = raw vibe tokens + Haiku-expansion genres (the interpretation
// of the WHOLE vibe). WEAK keywords = the fixed VIBE_TO_GENRES dictionary, which
// maps single context words ("night" → pop/hip hop/indie/…) and used to score
// equal to real intent — measured on a labeled eval library, that dilution left
// "anime night" with 1 on-vibe track in the top-50 candidates. When expansion is
// unavailable the dictionary is promoted back to strong (sole-signal fallback).
const GENRE_MATCH_SCORE = 3 // per STRONG-matching genre string…
const MAX_GENRE_MATCHES = 3 // …counted at most this many times (#3: cap runaway genre score)
const WEAK_GENRE_SCORE = 1 // per WEAK (dictionary context) match…
const MAX_WEAK_MATCHES = 2 // …so context hints tiebreak, never outrank intent
const AVOID_GENRE_PENALTY = 4 // vibe-expansion says this genre clashes with the vibe
const ERA_SCORE = 2
const NAME_MATCH_SCORE = 1 // vibe token appears in the track title
const POPULARITY_WEIGHT = 1 // soft tiebreak: popularity (0–100) → up to +1 (#3: less mainstream bias)
const VARIETY_WEIGHT = 0.6 // per-(vibe,track) jitter so ties vary by prompt (#3)
const MAX_PER_ARTIST = 3 // #4: at most N tracks per primary artist in the candidate set
// A track is "on-vibe" if its signal includes ≥1 strong genre match (or era+name).
// The candidate list is built from on-vibe tracks first — including DEEPER cuts
// of matching artists — and only tops up with no-signal popular tracks to reach
// this floor. Previously the list always padded to 150 with zero-signal tracks,
// handing Claude a mostly off-vibe pool it then "curated" from.
const STRONG_SIGNAL_MIN = GENRE_MATCH_SCORE
const MIN_CANDIDATE_POOL = 60

// Deterministic [0,1) hash (FNV-1a) — stable for a given (vibe, track) so results
// are reproducible per prompt but differ across prompts.
function hashUnit(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

// Vibe keyword → Spotify genre substrings (lowercase, substring-matched against track genres)
const VIBE_TO_GENRES: Record<string, string[]> = {
  // Activities / contexts
  minecraft: ['lo-fi', 'ambient', 'indie', 'chill', 'study', 'electronic'],
  gaming: ['electronic', 'edm', 'lo-fi', 'ambient', 'synth', 'indie'],
  coding: ['lo-fi', 'ambient', 'electronic', 'indie', 'study', 'instrumental'],
  study: ['lo-fi', 'ambient', 'classical', 'instrumental', 'study', 'jazz'],
  sleep: ['ambient', 'sleep', 'lo-fi', 'new age', 'classical'],
  gym: ['hip hop', 'rap', 'rock', 'metal', 'edm', 'electronic', 'trap'],
  workout: ['hip hop', 'rap', 'rock', 'metal', 'edm', 'electronic', 'trap'],
  drive: ['rock', 'pop', 'hip hop', 'country', 'indie'],
  party: ['pop', 'dance', 'hip hop', 'edm', 'electronic', 'trap'],
  road: ['rock', 'country', 'indie', 'folk', 'pop'],
  night: ['electronic', 'synth', 'hip hop', 'r&b', 'pop', 'indie'],
  late: ['electronic', 'synth', 'hip hop', 'r&b', 'ambient'],
  morning: ['folk', 'indie', 'acoustic', 'pop', 'jazz'],
  summer: ['pop', 'indie', 'reggae', 'surf', 'tropical'],
  winter: ['folk', 'indie', 'acoustic', 'classical', 'ambient'],
  rain: ['folk', 'indie', 'acoustic', 'ambient', 'jazz'],
  beach: ['reggae', 'surf', 'pop', 'indie', 'tropical'],
  focus: ['lo-fi', 'ambient', 'electronic', 'instrumental', 'classical'],
  background: ['lo-fi', 'ambient', 'jazz', 'classical', 'instrumental'],

  // Moods
  chill: ['chill', 'lo-fi', 'ambient', 'indie', 'downtempo', 'trip hop'],
  sad: ['indie', 'alternative', 'folk', 'emo', 'sad', 'acoustic'],
  happy: ['pop', 'indie pop', 'dance', 'funk', 'soul'],
  angry: ['metal', 'punk', 'hardcore', 'rock', 'alternative'],
  hype: ['hip hop', 'trap', 'edm', 'electronic', 'dance', 'pop'],
  energetic: ['rock', 'electronic', 'dance', 'hip hop', 'pop', 'edm'],
  melancholy: ['indie', 'folk', 'alternative', 'shoegaze', 'post-rock'],
  nostalgic: ['indie', 'alternative', 'classic rock', 'folk', 'pop'],
  romantic: ['r&b', 'soul', 'jazz', 'pop', 'indie'],
  hazy: ['shoegaze', 'dream pop', 'lo-fi', 'ambient', 'psychedelic'],
  dark: ['gothic', 'post-punk', 'industrial', 'metal', 'darkwave', 'alternative'],
  upbeat: ['pop', 'indie pop', 'dance', 'funk', 'soul', 'rock'],
  mellow: ['acoustic', 'folk', 'jazz', 'indie', 'r&b'],

  // Genre keywords (direct)
  jazz: ['jazz', 'bebop', 'swing', 'blues'],
  blues: ['blues', 'soul', 'r&b', 'jazz'],
  classical: ['classical', 'orchestral', 'chamber', 'piano', 'baroque'],
  hiphop: ['hip hop', 'rap', 'trap', 'r&b'],
  rap: ['hip hop', 'rap', 'trap', 'southern hip hop'],
  rnb: ['r&b', 'soul', 'funk', 'neo soul'],
  soul: ['soul', 'r&b', 'funk', 'gospel'],
  rock: ['rock', 'alternative', 'indie rock', 'classic rock', 'hard rock'],
  pop: ['pop', 'dance pop', 'indie pop', 'synth pop'],
  country: ['country', 'americana', 'bluegrass', 'folk'],
  folk: ['folk', 'acoustic', 'singer-songwriter', 'indie folk', 'americana'],
  indie: ['indie', 'alternative', 'indie pop', 'indie rock', 'bedroom pop'],
  electronic: ['electronic', 'edm', 'house', 'techno', 'synth'],
  metal: ['metal', 'heavy metal', 'death metal', 'hard rock', 'thrash'],
  punk: ['punk', 'pop punk', 'hardcore', 'emo'],
  alternative: ['alternative', 'indie', 'grunge', 'post-punk'],
  lofi: ['lo-fi', 'chillhop', 'downtempo', 'ambient'],
  ambient: ['ambient', 'new age', 'drone', 'atmospheric'],
  edm: ['edm', 'house', 'techno', 'trance', 'electronic', 'dance'],
  disco: ['disco', 'funk', 'dance', 'soul'],
  funk: ['funk', 'soul', 'disco', 'r&b'],
  reggae: ['reggae', 'dancehall', 'dub', 'ska'],
  latin: ['latin', 'salsa', 'reggaeton', 'cumbia', 'bossa nova'],
  acoustic: ['acoustic', 'folk', 'singer-songwriter', 'indie'],
  trap: ['trap', 'hip hop', 'rap'],
  house: ['house', 'electronic', 'dance', 'edm'],
  techno: ['techno', 'electronic', 'industrial'],
  emo: ['emo', 'pop punk', 'alternative', 'punk'],
  grunge: ['grunge', 'alternative', 'rock'],
  shoegaze: ['shoegaze', 'dream pop', 'indie', 'alternative'],
  psychedelic: ['psychedelic', 'indie', 'alternative', 'experimental'],
}

const ERA_PATTERNS: Array<{ pattern: RegExp; range: [number, number] }> = [
  { pattern: /\b50s|fifties\b/i, range: [1950, 1959] },
  { pattern: /\b60s|sixties\b/i, range: [1960, 1969] },
  { pattern: /\b70s|seventies\b/i, range: [1970, 1979] },
  { pattern: /\b80s|eighties\b/i, range: [1980, 1989] },
  { pattern: /\b90s|nineties\b/i, range: [1990, 1999] },
  { pattern: /\b2000s|two.?thousands\b/i, range: [2000, 2009] },
  { pattern: /\b2010s\b/i, range: [2010, 2019] },
  { pattern: /\b2020s\b/i, range: [2020, 2029] },
  { pattern: /\bretro|vintage|oldies\b/i, range: [1960, 1999] },
]

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'for',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'is',
  'it',
  'me',
  'my',
  'we',
  'our',
  'us',
  'be',
  'do',
  'up',
  'so',
  'if',
  'with',
  'like',
  'some',
  'that',
  'this',
  'was',
  'are',
  'has',
  'had',
  'boys',
  'girls',
  'good',
  'just',
  'really',
  'very',
  'vibe',
  'vibes',
  'music',
  'songs',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

function scoreTrack(
  track: Track,
  vibeTokens: string[],
  strongKeywords: Set<string>,
  weakKeywords: Set<string>,
  avoidKeywords: Set<string>,
  eraRanges: Array<[number, number]>
): number {
  let s = 0

  // Canonicalize track tags first so keyword hints ("r&b", "lo-fi") match raw
  // Last.fm variants ("rnb", "lofi") instead of silently missing them.
  const canonGenres = track.genres.map((g) => canonicalizeGenre(g) ?? g.toLowerCase())

  // Genre match — primary signal. Count each genre string at most once, and cap the
  // number of counted matches so a heavily-tagged track can't swamp a perfect single-tag one.
  // A genre string that matches both tiers counts only as strong.
  let strongMatches = 0
  let weakMatches = 0
  for (const g of canonGenres) {
    let matched = false
    for (const kw of strongKeywords) {
      if (g.includes(kw)) {
        strongMatches++
        matched = true
        break
      }
    }
    if (matched) continue
    for (const kw of weakKeywords) {
      if (g.includes(kw)) {
        weakMatches++
        break
      }
    }
  }
  s += Math.min(strongMatches, MAX_GENRE_MATCHES) * GENRE_MATCH_SCORE
  s += Math.min(weakMatches, MAX_WEAK_MATCHES) * WEAK_GENRE_SCORE

  // Clash penalty — the vibe expansion flagged these genres as fighting the vibe
  // (e.g. death metal on a sleep playlist). Soft: one penalty, not a hard drop,
  // so a track tagged both "ambient" and "metal" can still surface if it earns it.
  if (avoidKeywords.size > 0) {
    outer: for (const g of canonGenres) {
      for (const kw of avoidKeywords) {
        if (g.includes(kw)) {
          s -= AVOID_GENRE_PENALTY
          break outer
        }
      }
    }
  }

  // Era match
  if (eraRanges.length > 0 && track.year > 0) {
    for (const [start, end] of eraRanges) {
      if (track.year >= start && track.year <= end) {
        s += ERA_SCORE
        break
      }
    }
  }

  // Vibe token found in track name
  const nameLower = track.name.toLowerCase()
  for (const token of vibeTokens) {
    if (token.length > 2 && nameLower.includes(token)) s += NAME_MATCH_SCORE
  }

  return s
}

// True when the artist's FULL name appears in the vibe as whole words
// ("give me all drake" names "drake"). Token-in-name substring matching is
// deliberately avoided: it made "late night drive" boost every artist with
// "night" in their name and exempt them from the diversity cap — a major
// source of off-vibe playlists.
function vibeNamesArtist(vibeLower: string, artistLower: string): boolean {
  if (artistLower.length < 3) return false
  let idx = vibeLower.indexOf(artistLower)
  while (idx !== -1) {
    const before = idx === 0 || !/[a-z0-9]/.test(vibeLower[idx - 1])
    const end = idx + artistLower.length
    const after = end >= vibeLower.length || !/[a-z0-9]/.test(vibeLower[end])
    if (before && after) return true
    idx = vibeLower.indexOf(artistLower, idx + 1)
  }
  return false
}

// Substring match of a track's genres against any filter term. Track tags are
// canonicalized first so a canonical chip term ("hip hop") matches raw Last.fm
// variants ("hiphop"/"hip-hop") on the track. Terms arrive already canonical/lowercased.
function genresMatchAny(track: Track, terms: string[]): boolean {
  if (terms.length === 0) return false
  const genres = track.genres.map((g) => canonicalizeGenre(g) ?? g.toLowerCase())
  return terms.some((term) => genres.some((g) => g.includes(term)))
}

// Case-insensitive substring match of any of a track's artists against any filter term.
function artistsMatchAny(track: Track, terms: string[]): boolean {
  if (terms.length === 0) return false
  const artists = track.artists.map((a) => a.toLowerCase())
  return terms.some((term) => artists.some((a) => a.includes(term)))
}

// HARD gate: a track must survive every active filter dimension (AND across
// dimensions; OR within one). Empty dimensions are skipped. Returns false to drop.
function passesFilters(track: Track, f: CurateFilters): boolean {
  if (f.excludeGenres.length && genresMatchAny(track, f.excludeGenres)) return false
  if (f.includeGenres.length && !genresMatchAny(track, f.includeGenres)) return false
  if (f.excludeArtists.length && artistsMatchAny(track, f.excludeArtists)) return false
  if (f.includeArtists.length && !artistsMatchAny(track, f.includeArtists)) return false
  if (f.decades.length) {
    if (track.year <= 0) return false
    const decade = Math.floor(track.year / 10) * 10
    if (!f.decades.includes(decade)) return false
  }
  return true
}

// Lowercase + trim a filter dimension's terms; drop blanks so a stray "" can't match everything.
function normalizeTerms(terms: string[]): string[] {
  return terms.map((t) => t.trim().toLowerCase()).filter(Boolean)
}

export function preFilter(
  library: Track[],
  vibe: string,
  filters?: CurateFilters,
  expansion?: VibeExpansion | null,
  limit: number = MAX_CANDIDATES
): CandidateTrack[] {
  if (library.length === 0) return []

  // Normalize filter terms up front so gating and cap-exemption compare like-for-like.
  const f: CurateFilters | null = filters
    ? {
        ...filters,
        includeGenres: normalizeTerms(filters.includeGenres),
        excludeGenres: normalizeTerms(filters.excludeGenres),
        includeArtists: normalizeTerms(filters.includeArtists),
        excludeArtists: normalizeTerms(filters.excludeArtists),
      }
    : null

  const pool = f ? library.filter((t) => passesFilters(t, f)) : library
  if (pool.length === 0) return []

  const vibeTokens = tokenize(vibe)

  // STRONG tier: raw vibe tokens (someone typing "shoegaze" means shoegaze) plus
  // the Haiku expansion's genres — the interpretation of the whole vibe.
  // WEAK tier: the per-token dictionary's context mappings. When expansion is
  // missing (endpoint down, cache cold), the dictionary is promoted to strong so
  // off-dictionary behavior degrades to the old single-tier scoring.
  const strongKeywords = new Set<string>(vibeTokens)
  const weakKeywords = new Set<string>()
  const hasExpansionGenres = Boolean(expansion && expansion.genres.length > 0)
  for (const token of vibeTokens) {
    const mapped = VIBE_TO_GENRES[token]
    if (mapped) mapped.forEach((kw) => (hasExpansionGenres ? weakKeywords : strongKeywords).add(kw))
  }

  // Detect era year ranges from the raw vibe string
  const eraRanges: Array<[number, number]> = []
  for (const { pattern, range } of ERA_PATTERNS) {
    if (pattern.test(vibe)) eraRanges.push(range)
  }

  // Haiku vibe-expansion (optional). Keywords are canonicalized so they land on
  // the same vocabulary as (canonicalized) track tags.
  const avoidKeywords = new Set<string>()
  if (expansion) {
    for (const g of expansion.genres) {
      const kw = g.toLowerCase().trim()
      if (!kw) continue
      strongKeywords.add(kw)
      const canon = canonicalizeGenre(kw)
      if (canon) strongKeywords.add(canon)
    }
    for (const g of expansion.avoidGenres) {
      const kw = g.toLowerCase().trim()
      if (!kw) continue
      avoidKeywords.add(canonicalizeGenre(kw) ?? kw)
    }
    for (const start of expansion.decades) {
      if (Number.isFinite(start)) eraRanges.push([start, start + 9])
    }
  }
  // A genre can't be both wanted and avoided — wanted wins. Weak hints also
  // shouldn't fight the strong tier or the avoid list.
  for (const kw of strongKeywords) {
    avoidKeywords.delete(kw)
    weakKeywords.delete(kw)
  }
  for (const kw of avoidKeywords) weakKeywords.delete(kw)

  const includeArtists = f?.includeArtists ?? []

  // Vibe-mentioned artists: an artist whose FULL name appears in the free-text
  // vibe (e.g. "give me all Drake") gets the same depth treatment as the explicit
  // Include-Artist filter, without needing the filter UI.
  const vibeLower = vibe.toLowerCase()
  const vibeMentionedArtists = new Set<string>()
  for (const track of pool) {
    for (const artist of track.artists) {
      const a = artist.toLowerCase()
      if (vibeMentionedArtists.has(a)) continue
      if (vibeNamesArtist(vibeLower, a)) vibeMentionedArtists.add(a)
    }
  }

  // Boost/cap-exemption test: vibe-mentioned artists match by EXACT name (so
  // "Drake" in the vibe doesn't also boost "Drake Bell"); user-typed include
  // filters keep substring semantics since they may be partial names.
  const isBoosted = (track: Track): boolean =>
    track.artists.some((a) => vibeMentionedArtists.has(a.toLowerCase())) ||
    artistsMatchAny(track, includeArtists)

  const scored = pool.map((track) => {
    const signal = scoreTrack(
      track,
      vibeTokens,
      strongKeywords,
      weakKeywords,
      avoidKeywords,
      eraRanges
    )
    // Blend a soft popularity nudge (≤ +1) and per-vibe variety jitter (≤ VARIETY_WEIGHT)
    // into the score. Both are smaller than one genre match, so real signal always wins;
    // they only reorder tracks the signal ranks equally (esp. the zero-score long tail).
    const popularity = ((track.popularity || 0) / 100) * POPULARITY_WEIGHT
    const variety = hashUnit(`${vibe}|${track.id}`) * VARIETY_WEIGHT
    // #1 adaptive cap: artists explicitly included OR named in the vibe are the
    // point of the playlist — boost them.
    const boosted = isBoosted(track)
    const boost = boosted ? INCLUDE_ARTIST_BOOST : 0
    return { track, boosted, signal, score: signal + popularity + variety + boost }
  })

  scored.sort((a, b) => b.score - a.score)

  // On-vibe pool first: tracks with a real signal (≥1 strong genre match, or a
  // boosted artist). Weak/no-signal tracks only TOP UP to the floor — they never
  // crowd out on-vibe depth, and a clean pool beats a padded one for the LLM.
  const onVibe = scored.filter((s) => s.boosted || s.signal >= STRONG_SIGNAL_MIN)
  const filler = scored.filter((s) => !(s.boosted || s.signal >= STRONG_SIGNAL_MIN))

  // #4: cap tracks per primary artist so a few prolific artists can't dominate
  // the head of the set. Overflow (deeper cuts of on-vibe artists) follows the
  // capped picks — still on-vibe, so it beats any filler.
  const perArtist = new Map<string, number>()
  const picked: Track[] = []
  const overflow: Track[] = []
  for (const { track, boosted } of onVibe) {
    // #1 adaptive cap: when an artist is explicitly included OR named in the
    // vibe, go deep on them — exempt their tracks from the per-artist diversity cap.
    if (boosted) {
      picked.push(track)
      continue
    }
    const key = track.artists[0]?.toLowerCase() ?? ''
    const count = perArtist.get(key) ?? 0
    if (count < MAX_PER_ARTIST) {
      perArtist.set(key, count + 1)
      picked.push(track)
    } else {
      overflow.push(track)
    }
  }

  const result = picked.concat(overflow)
  // Vague vibes (little/no genre signal) still need a workable pool — top up
  // with the best remaining tracks (weak hints, then popularity/jitter order).
  const floor = Math.min(Math.max(MIN_CANDIDATE_POOL, result.length), limit)
  for (const { track } of filler) {
    if (result.length >= floor) break
    result.push(track)
  }

  return result.slice(0, limit).map((track) => ({
    id: track.id,
    name: track.name,
    artists: track.artists,
    genres: track.genres,
    year: track.year,
  }))
}
