import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../utils/axios';
import { getInitials, handleApiError } from '../utils/helpers';
import ReviewsList from '../components/reviews/ReviewsList';
import './TeacherProfilePage.css';

interface TeacherSkill {
  id: string;
  skillName: string;
  level: string;
  creditsPerHour: number;
  description: string;
}

interface TeacherProfile {
  id: string;
  name: string;
  college?: string;
  yearOfStudy?: string;
  bio?: string;
  avatarUrl?: string;
  rating: number;
  reviewCount: number;
  skillsToTeach: TeacherSkill[];
}

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`/users/${id}`);
        setProfile(response.data);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id]);

  if (loading) {
    return (
      <div className="teacher-page-container">
        <div className="page-shell"><p className="teacher-status">Loading…</p></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="teacher-page-container">
        <div className="page-shell">
          <p className="teacher-status">{error || 'That person could not be found.'}</p>
          <Link to="/" className="teacher-back">Back to Discover</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-page-container">
      <div className="page-shell">
        <div className="page-heading">
          <h1>{profile.name}</h1>
          <p>
            {[profile.college, profile.yearOfStudy].filter(Boolean).join(' · ') || 'Skill Swap member'}
          </p>
        </div>

        <div className="teacher-card">
          <div className="teacher-identity">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className="teacher-avatar" />
              : <div className="teacher-avatar teacher-avatar-initials">{getInitials(profile.name)}</div>}

            <div className="teacher-meta">
              <p className="teacher-rating">
                {profile.reviewCount > 0
                  ? `${profile.rating} out of 5 · ${profile.reviewCount} ${profile.reviewCount === 1 ? 'review' : 'reviews'}`
                  : 'No reviews yet'}
              </p>
              {profile.bio && <p className="teacher-bio">{profile.bio}</p>}
            </div>
          </div>
        </div>

        <div className="teacher-card">
          <h2 className="teacher-section-title">Skills they teach</h2>
          {profile.skillsToTeach.length === 0 ? (
            <p className="teacher-status">Not teaching anything yet.</p>
          ) : (
            <div className="teacher-skills">
              {profile.skillsToTeach.map((skill) => (
                <div key={skill.id} className="teacher-skill">
                  <h3>{skill.skillName}</h3>
                  <div className="teacher-skill-tags">
                    <span className="skill-tag">{skill.level}</span>
                    <span className="skill-tag credits">{skill.creditsPerHour} credits/hr</span>
                  </div>
                  <p className="teacher-skill-description">{skill.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <ReviewsList userId={profile.id} userName={profile.name} />
      </div>
    </div>
  );
}
