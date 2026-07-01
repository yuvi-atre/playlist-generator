// Genre normalization for Last.fm tags.
//
// Last.fm tags are crowd-sourced and messy: the same genre shows up under several
// spellings (hiphop / hip-hop / hip hop), and the feed is padded with descriptor
// tags that aren't genres at all (decades, nationalities, "male vocalists"). This
// collapses the variants and drops the non-genres so the genre COUNT, the filter
// CHIPS, and the include/exclude MATCHING all work off clean, canonical strings.
//
// Applied at read/display + filter-match time (not baked into the cache), so it
// takes effect on the existing library with no re-fetch. Kept deliberately OUT of
// the tuned vibe-scoring path in preFilter (scoreTrack / VIBE_TO_GENRES).

// Non-genre descriptor tags to drop entirely.
const DROP_TAGS = new Set([
  'vocalist',
  'vocalists',
  'male vocalists',
  'female vocalists',
  'male vocalist',
  'female vocalist',
  'instrumental',
  'guitar',
  'piano',
  'guitarist',
  'band',
  'music',
  'song',
  'songs',
  'cover',
  'covers',
  'radio',
  'spotify',
  'vinyl',
  'favorite',
  'favorites',
  'favourite',
  'favourites',
  'favorite songs',
  'good',
  'best',
  'cool',
  'nice',
  'awesome',
  'beautiful',
  'amazing',
  'catchy',
  'all',
  'various',
  'various artists',
  'other',
  'misc',
  'unknown',
  'genre',
  'seen live',
  'love',
  'love at first listen',
  'under 2000 listeners',
])

// Nationality / language tags — location, not genre. (Kept separate from genres
// like "latin" or "k-pop" which ARE genres and survive.)
const DROP_NATIONALITIES = new Set([
  'british',
  'american',
  'english',
  'uk',
  'usa',
  'us',
  'german',
  'french',
  'spanish',
  'japanese',
  'korean',
  'swedish',
  'norwegian',
  'finnish',
  'danish',
  'canadian',
  'australian',
  'irish',
  'scottish',
  'italian',
  'dutch',
  'brazilian',
  'mexican',
  'russian',
  'polish',
  'icelandic',
  'welsh',
  'europe',
  'european',
])

// Variant / misspelling → canonical. Keys are compared after basic cleanup
// (lowercase, trimmed, internal whitespace collapsed). Canonical forms are chosen
// to stay compatible with the substrings preFilter's VIBE_TO_GENRES already uses
// (e.g. keep the hyphen in "lo-fi"/"post-rock", the space in "hip hop").
const GENRE_ALIASES: Record<string, string> = {
  hiphop: 'hip hop',
  'hip-hop': 'hip hop',
  'hip hop music': 'hip hop',
  rap: 'hip hop',
  'trip-hop': 'trip hop',
  triphop: 'trip hop',
  rnb: 'r&b',
  'r n b': 'r&b',
  'r&b/soul': 'r&b',
  'rhythm and blues': 'r&b',
  'rhythm & blues': 'r&b',
  lofi: 'lo-fi',
  'lo fi': 'lo-fi',
  'low-fi': 'lo-fi',
  synthpop: 'synth pop',
  'synth-pop': 'synth pop',
  'alt rock': 'alternative rock',
  'alt-rock': 'alternative rock',
  altrock: 'alternative rock',
  alternative: 'alternative rock',
  indierock: 'indie rock',
  indiepop: 'indie pop',
  dreampop: 'dream pop',
  'dream-pop': 'dream pop',
  'post punk': 'post-punk',
  postpunk: 'post-punk',
  'post rock': 'post-rock',
  postrock: 'post-rock',
  'nu-metal': 'nu metal',
  numetal: 'nu metal',
  'new-wave': 'new wave',
  newwave: 'new wave',
  electronica: 'electronic',
  edm: 'electronic',
  dnb: 'drum and bass',
  'drum n bass': 'drum and bass',
  'drum & bass': 'drum and bass',
  "drum'n'bass": 'drum and bass',
  'rock n roll': 'rock and roll',
  "rock 'n' roll": 'rock and roll',
  "rock'n'roll": 'rock and roll',
  'singer songwriter': 'singer-songwriter',
  'r&b and soul': 'r&b',
  'classic-rock': 'classic rock',
  'hard-rock': 'hard rock',
  'pop-punk': 'pop punk',
  poppunk: 'pop punk',
  kpop: 'k-pop',
  'k pop': 'k-pop',
}

// Canonicalize a single raw tag. Returns null for tags that should be dropped.
export function canonicalizeGenre(raw: string): string | null {
  const g = raw
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!g || g.length < 2) return null
  if (DROP_TAGS.has(g)) return null
  if (DROP_NATIONALITIES.has(g)) return null
  // Decade tags: "90s", "1990s", "00s", "2000s", "80's".
  if (/^(19|20)?\d0['’]?s$/.test(g)) return null

  return GENRE_ALIASES[g] ?? g
}

// Canonicalize + dedupe a list of tags (order preserved by first appearance).
export function canonicalizeGenres(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const g = canonicalizeGenre(raw)
    if (g && !seen.has(g)) {
      seen.add(g)
      out.push(g)
    }
  }
  return out
}
