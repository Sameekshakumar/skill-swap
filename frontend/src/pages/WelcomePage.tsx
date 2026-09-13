import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import axios from '../utils/axios'
import { AmbientBackground } from '../components/layout/AmbientBackground'
import { handleApiError } from '../utils/helpers'
import './WelcomePage.css'

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate']

// Google gives us a name, an email and a photo — not a college or a year.
// New accounts land here once to fill in the rest.
export default function WelcomePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [college, setCollege] = useState(user?.college ?? '')
  const [yearOfStudy, setYearOfStudy] = useState(user?.yearOfStudy ?? '')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!college.trim() || !yearOfStudy) {
      setError('Please tell us your college and year of study')
      return
    }

    setSaving(true)
    try {
      await axios.put('/profile', { college: college.trim(), yearOfStudy, bio: bio.trim() })
      await refreshUser()
      navigate('/discover')
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="welcome-container">
      <AmbientBackground />
      <div className="welcome-box">
        <h1 className="welcome-title">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="welcome-subtitle">
          Two quick details so people can see who they would be learning from.
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="welcome-form">
          <div className="form-group">
            <label htmlFor="college" className="form-label">College</label>
            <input
              id="college"
              type="text"
              className="welcome-input"
              placeholder="Your college or university"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="yearOfStudy" className="form-label">Year of Study</label>
            <select
              id="yearOfStudy"
              className="welcome-input"
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value)}
            >
              <option value="">Select your year</option>
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="bio" className="form-label">About you <span className="optional">(optional)</span></label>
            <textarea
              id="bio"
              className="welcome-input welcome-textarea"
              placeholder="What are you into? Keep it short."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <button type="submit" className="welcome-button" disabled={saving}>
            {saving ? 'Saving…' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
