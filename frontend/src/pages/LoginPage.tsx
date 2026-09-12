import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleSignInButton from '../components/auth/GoogleSignInButton'
import { handleApiError } from '../utils/helpers'
import './LoginPage.css'

export default function LoginPage() {
  const { loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const handleCredential = useCallback(async (credential: string) => {
    setError('')
    try {
      const user = await loginWithGoogle(credential)
      // First time here: collect the details Google cannot give us.
      navigate(user.profileComplete ? '/' : '/welcome')
    } catch (err) {
      setError(handleApiError(err))
    }
  }, [loginWithGoogle, navigate])

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Skill Swap</h1>
        <p className="login-subtitle">Trade what you know for what you want to learn</p>

        {error && <div className="error-message">{error}</div>}

        <div className="google-signin-row">
          <GoogleSignInButton onCredential={handleCredential} onError={setError} />
        </div>

        <p className="login-footnote">
          We use your Google account to sign you in. Your password stays with Google —
          Skill Swap never sees it.
        </p>
      </div>
    </div>
  )
}
