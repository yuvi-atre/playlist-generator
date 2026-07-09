// Request guard for the serverless endpoints (imported by api/*.ts, runs
// server-side only — keep this file free of browser globals).
//
// The endpoints spend real Anthropic credit per call, so block the cheap abuse
// vector: another WEBSITE hotlinking our API from a browser. Browsers always
// attach an Origin header to cross-site POSTs, so an unrecognized Origin is
// rejected. Requests WITHOUT an Origin (curl, server-to-server) are allowed —
// this is a hotlink deterrent, not authentication; the Console spend cap is
// the real backstop.

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/playlist-generator(-[a-z0-9-]+)?\.vercel\.app$/, // prod + preview deploys
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/, // local dev
]

export function originAllowed(origin: string | string[] | undefined): boolean {
  if (origin === undefined) return true // non-browser client — see note above
  const value = Array.isArray(origin) ? origin[0] : origin
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(value))
}
