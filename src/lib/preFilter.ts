import type { CandidateTrack, Track } from './types'

const MAX_CANDIDATES = 150

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
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'of', 'to', 'in', 'on', 'at', 'by',
  'is', 'it', 'me', 'my', 'we', 'our', 'us', 'be', 'do', 'up', 'so', 'if',
  'with', 'like', 'some', 'that', 'this', 'was', 'are', 'has', 'had', 'boys',
  'girls', 'good', 'just', 'really', 'very', 'vibe', 'vibes', 'music', 'songs',
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
  genreKeywords: Set<string>,
  eraRanges: Array<[number, number]>
): number {
  let s = 0

  // Genre match — primary signal, +3 per matching genre string
  for (const genre of track.genres) {
    const g = genre.toLowerCase()
    for (const kw of genreKeywords) {
      if (g.includes(kw)) {
        s += 3
        break // count each genre string at most once
      }
    }
  }

  // Era match
  if (eraRanges.length > 0 && track.year > 0) {
    for (const [start, end] of eraRanges) {
      if (track.year >= start && track.year <= end) {
        s += 2
        break
      }
    }
  }

  // Artist name mentioned in vibe tokens
  const artistsLower = track.artists.map((a) => a.toLowerCase())
  for (const token of vibeTokens) {
    if (token.length < 3) continue
    for (const artist of artistsLower) {
      if (artist.includes(token)) s += 5
    }
  }

  // Vibe token found in track name
  const nameLower = track.name.toLowerCase()
  for (const token of vibeTokens) {
    if (token.length > 2 && nameLower.includes(token)) s += 1
  }

  return s
}

export function preFilter(library: Track[], vibe: string): CandidateTrack[] {
  if (library.length === 0) return []

  const vibeTokens = tokenize(vibe)

  // Expand vibe tokens to genre substrings to match against track genres
  const genreKeywords = new Set<string>()
  for (const token of vibeTokens) {
    const mapped = VIBE_TO_GENRES[token]
    if (mapped) mapped.forEach((kw) => genreKeywords.add(kw))
    genreKeywords.add(token)
  }

  // Detect era year ranges from the raw vibe string
  const eraRanges: Array<[number, number]> = []
  for (const { pattern, range } of ERA_PATTERNS) {
    if (pattern.test(vibe)) eraRanges.push(range)
  }

  const scored = library.map((track) => ({
    track,
    score: scoreTrack(track, vibeTokens, genreKeywords, eraRanges),
  }))

  // Sort by score desc, popularity as tiebreaker (so zero-score tracks are ranked by popularity)
  scored.sort((a, b) => b.score - a.score || b.track.popularity - a.track.popularity)

  return scored.slice(0, MAX_CANDIDATES).map(({ track }) => ({
    id: track.id,
    name: track.name,
    artists: track.artists,
    genres: track.genres,
    year: track.year,
  }))
}
