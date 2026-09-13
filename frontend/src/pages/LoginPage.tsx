import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleSignInButton from '../components/auth/GoogleSignInButton'
import { AmbientBackground } from '../components/layout/AmbientBackground'
import { isRemembered } from '../utils/session'
import { handleApiError } from '../utils/helpers'
import './LoginPage.css'

export default function LoginPage() {
  const { loginWithGoogle, isAuthenticated, loading, user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  // Whatever was chosen last time is the sensible default for this time.
  const [remember, setRemember] = useState(isRemembered())

  const handleCredential = useCallback(async (credential: string) => {
    setError('')
    try {
      const signedIn = await loginWithGoogle(credential, remember)
      // First time here: collect the details Google cannot give us.
      navigate(signedIn.profileComplete ? '/discover' : '/welcome')
    } catch (err) {
      setError(handleApiError(err))
    }
  }, [loginWithGoogle, navigate, remember])

  // Still checking the saved session — showing the sign-in button now would
  // make an already signed-in visitor think they had been logged out.
  if (loading) {
    return <div className="login-container"><AmbientBackground /></div>
  }

  if (isAuthenticated) {
    return <Navigate to={user?.profileComplete === false ? '/welcome' : '/discover'} replace />
  }

  return (
    <div className="login-container">
      <AmbientBackground />
      <div className="login-box">
        <h1 className="login-title">Skill Swap</h1>
        <p className="login-subtitle">Trade what you know for what you want to learn</p>

        {error && <div className="error-message">{error}</div>}

        <div className="login-controls">
          <div className="google-signin-row">
            <GoogleSignInButton
              onCredential={handleCredential}
              onError={setError}
              autoSignIn={remember}
            />
          </div>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Keep me signed in on this device</span>
          </label>
        </div>

        <p className="login-footnote">
          We use your Google account to sign you in. Your password stays with Google —
          Skill Swap never sees it.
        </p>
      </div>
    </div>
  )
}
