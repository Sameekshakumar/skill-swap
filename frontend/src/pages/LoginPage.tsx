import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AmbientBackground } from '../components/layout/AmbientBackground'
import { isRemembered } from '../utils/session'
import { handleApiError } from '../utils/helpers'
import './LoginPage.css'

// Matches the minimum the server enforces, so the form can say so before the
// round trip rather than after it.
const MIN_PASSWORD_LENGTH = 8

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  minLength?: number
  // Drawn in the reject colour while the two entries disagree.
  invalid?: boolean
}

// Each password field reveals itself independently, so you can check a
// confirmation against a hidden original.
//
// Declared here rather than inside LoginPage: a component re-created on every
// render is a new type each time, so React would remount the input and it
// would lose focus after each keystroke.
function PasswordField({ label, value, onChange, autoComplete, minLength, invalid }: PasswordFieldProps) {
  const [shown, setShown] = useState(false)

  return (
    <label className="login-field">
      <span>{label}</span>
      {/* The toggle sits inside the field, so the input needs room for it. */}
      <span className="login-password-wrap">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          className={invalid ? 'is-invalid' : undefined}
          aria-invalid={invalid || undefined}
          required
        />
        <button
          type="button"
          className="login-reveal"
          onClick={() => setShown((was) => !was)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  )
}

export default function LoginPage() {
  const { login, register, isAuthenticated, loading, user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Whatever was chosen last time is the sensible default for this time.
  const [remember, setRemember] = useState(isRemembered())

  const registering = mode === 'register'
  const mismatch = registering && confirmPassword.length > 0 && confirmPassword !== password

  const switchMode = () => {
    setMode(registering ? 'login' : 'register')
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    if (registering) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
        return
      }
      if (password !== confirmPassword) {
        setError('Those passwords do not match')
        return
      }
    }

    setError('')
    setSubmitting(true)
    try {
      const signedIn = registering
        ? await register({ name: name.trim(), email: email.trim(), password }, remember)
        : await login(email.trim(), password, remember)

      // A new account has no college or year yet; collect them first.
      navigate(signedIn.profileComplete ? '/discover' : '/welcome')
    } catch (err) {
      setError(handleApiError(err))
      setSubmitting(false)
    }
  }

  // Still checking the saved session — showing the form now would make an
  // already signed-in visitor think they had been logged out.
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

        <form className="login-form" onSubmit={handleSubmit}>
          {registering && (
            <label className="login-field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            // Tells a password manager to offer a new one rather than an old.
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? MIN_PASSWORD_LENGTH : undefined}
          />

          {registering && (
            <>
              <PasswordField
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                invalid={mismatch}
              />
              {mismatch && <p className="login-mismatch">Those passwords do not match</p>}
            </>
          )}

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Keep me signed in on this device</span>
          </label>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting
              ? (registering ? 'Creating account...' : 'Signing in...')
              : (registering ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <p className="login-footnote">
          {registering ? 'Already have an account?' : 'New to Skill Swap?'}{' '}
          <button type="button" className="login-switch" onClick={switchMode}>
            {registering ? 'Sign in' : 'Create one'}
          </button>
        </p>

        <Link to="/" className="login-back">Back to home</Link>
      </div>
    </div>
  )
}
