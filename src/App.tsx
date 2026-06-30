import { useEffect } from 'react'
import { CallbackHandler } from './components/CallbackHandler'
import { LibraryScreen } from './components/LibraryScreen'
import { LoginScreen } from './components/LoginScreen'
import { useLibrary } from './hooks/useLibrary'
import { useSpotifyAuth } from './hooks/useSpotifyAuth'

export default function App() {
  // Handle the OAuth callback route before anything else
  if (window.location.pathname === '/callback') {
    return <CallbackHandler />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const auth = useSpotifyAuth()
  const library = useLibrary(auth.getAccessToken)

  // Auto-load library once authenticated
  useEffect(() => {
    if (auth.tokens) {
      void library.load()
    }
  }, [auth.tokens, library.load])

  if (!auth.tokens) {
    return <LoginScreen onLogin={auth.login} loading={auth.loading} error={auth.error} />
  }

  return <LibraryScreen user={auth.user} library={library} onLogout={auth.logout} />
}
