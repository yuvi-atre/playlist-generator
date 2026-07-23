// Discovery-mode verification: Claude proposes a real-sounding song by
// knowledge (no track ID — models hallucinate IDs), and THIS function decides
// whether a Spotify Search result actually confirms it. Pure, no network — the
// network call (api/discover.ts) hands it real search results.
//
// Risk surface this guards against (each has a fixture in the scratchpad eval
// this was built and verified against): hallucinated songs with no real match,
// wrong versions (live/remix/karaoke) outranking the studio cut, an unrelated
// artist who happens to share a song title, and re-"discovering" a track the
// user already has saved.

export interface SearchResultTrack {
  id: string
  name: string
  artists: string[]
  popularity: number
  albumArt: string | null
  year: number
}

export interface SongProposal {
  title: string
  artist: string
}

const VERSION_BLACKLIST = [
  'live',
  'remix',
  'karaoke',
  'cover',
  'sped up',
  'slowed',
  '8d',
  'acoustic',
  'demo',
]

const MIN_TITLE_SIMILARITY = 0.7

// Punctuation becomes a SPACE, not deleted — deleting turns "Anti-Hero" into
// "antihero", a single token that no longer overlaps with "Anti Hero" and
// silently rejects a real match. (Caught by the fixture eval before this
// shipped — see the "punctuation drift" case.)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ') // strip parentheticals: (feat. X), (Remastered)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleSimilarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  const wa = new Set(na.split(' '))
  const wb = new Set(nb.split(' '))
  const overlap = [...wa].filter((w) => wb.has(w)).length
  return overlap / Math.max(wa.size, wb.size, 1)
}

// Returns the best verified match for a proposal, or null if nothing in
// `searchResults` genuinely confirms it. `libraryTrackIds` drops anything the
// user already has — the entire point of Discovery is genuinely new tracks.
export function verifyDiscovery(
  proposal: SongProposal,
  searchResults: SearchResultTrack[],
  libraryTrackIds: Set<string>
): SearchResultTrack | null {
  const candidates = searchResults.filter((r) => {
    if (libraryTrackIds.has(r.id)) return false
    // Artist must match on normalized equality, not substring — otherwise
    // "Home" by an unrelated band passes just for sharing a common title.
    if (!r.artists.some((a) => normalize(a) === normalize(proposal.artist))) return false
    if (titleSimilarity(r.name, proposal.title) < MIN_TITLE_SIMILARITY) return false
    const proposalWantsVariant = VERSION_BLACKLIST.some((v) =>
      normalize(proposal.title).includes(v)
    )
    if (!proposalWantsVariant && VERSION_BLACKLIST.some((v) => normalize(r.name).includes(v))) {
      return false
    }
    return true
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.popularity - a.popularity)
  return candidates[0]
}
