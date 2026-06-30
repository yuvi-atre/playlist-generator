import { useCallback, useEffect, useRef, useState } from 'react'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce'
import { buildAuthUrl, fetchCurrentUser, isExpired, refreshAccessToken } from '../lib/spotify'
import { storage } from '../lib/storage'
import type { AppError, SpotifyTokens, SpotifyUser } from '../lib/types'

export interface SpotifyAuth {
  tokens: SpotifyTokens | null
  user: SpotifyUser | null
  loading: boolean
  error: AppError | null
  login: () => Promise<void>
  logout: () => void
  /** Always returns a valid (non-expired) access token, refreshing if needed. */
  getAccessToken: () => Promise<string>
}

export function useSpotifyAuth(): SpotifyAuth {
  const [tokens, setTokens] = useState<SpotifyTokens | null>(() => storage.tokens.get())
  const [user, setUser] = useState<SpotifyUser | null>(() => storage.user.get())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Keep a ref so getAccessToken always reads the latest tokens without needing
  // to be in the dependency array (prevents library.load from re-creating on every refresh)
  const tokensRef = useRef(tokens)
  useEffect(() => {
    tokensRef.current = tokens
  }, [tokens])

  // Load user profile once we have tokens but no cached profile
  useEffect(() => {
    if (!tokens || user) return
    void (async () => {
      try {
        const token = await getAccessToken()
        const profile = await fetchCurrentUser(token)
        setUser(profile)
        storage.user.set(profile)
      } catch {
        // User profile is cosmetic — don't block the app
      }
    })()
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      const state = generateState()
      sessionStorage.setItem('pkce_verifier', verifier)
      sessionStorage.setItem('pkce_state', state)
      window.location.href = buildAuthUrl(challenge, state)
    } catch {
      setError({ code: 'api_error', message: 'Could not start login. Please try again.' })
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    storage.clearAll()
    setTokens(null)
    setUser(null)
    setError(null)
  }, [])

  // Stable reference — reads from ref, so identity never changes
  const getAccessToken = useCallback(async (): Promise<string> => {
    let current = tokensRef.current ?? storage.tokens.get()
    if (!current) throw Object.assign(new Error('Not authenticated'), { code: 'token_expired' })

    if (isExpired(current)) {
      try {
        const refreshed = await refreshAccessToken(current.refreshToken)
        storage.tokens.set(refreshed)
        setTokens(refreshed)
        tokensRef.current = refreshed
        current = refreshed
      } catch {
        storage.clearAll()
        setTokens(null)
        setUser(null)
        throw Object.assign(new Error('Session expired — please log in again.'), {
          code: 'token_expired',
        })
      }
    }

    return current.accessToken
  }, []) // intentionally empty — reads from ref

  return { tokens, user, loading, error, login, logout, getAccessToken }
}
