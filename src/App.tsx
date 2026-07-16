import { useEffect, useState } from 'react'
import { CallbackHandler } from './components/CallbackHandler'
import { DemoScreen } from './components/DemoScreen'
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
  const { load } = library // stable identity (useCallback) — safe as the sole effect dep
  // Demo mode: full curation on a bundled sample library, no Spotify account.
  const [demo, setDemo] = useState(false)

  // Auto-load library once authenticated
  useEffect(() => {
    if (auth.tokens) {
      void load()
    }
  }, [auth.tokens, load])

  if (!auth.tokens) {
    if (demo) return <DemoScreen onExit={() => setDemo(false)} />
    return (
      <LoginScreen
        onLogin={auth.login}
        onTryDemo={() => setDemo(true)}
        loading={auth.loading}
        error={auth.error}
      />
    )
  }

  return (
    <LibraryScreen
      user={auth.user}
      library={library}
      getAccessToken={auth.getAccessToken}
      onLogout={auth.logout}
    />
  )
}
