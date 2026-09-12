import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import axios from '../utils/axios';
import { getInitials, handleApiError } from '../utils/helpers';
import ReviewsList from '../components/reviews/ReviewsList';
import './ProfilePage.css';

interface Skill {
  id?: string;
  skillName: string;
  level?: string;
  creditsPerHour?: number;
  description?: string;
}

interface ModalProps {
  modalType: 'teach' | 'learn';
  onClose: () => void;
  onSubmit: (skill: Skill) => void;
}

interface UserProfile {
  name: string;
  email: string;
  college?: string;
  yearOfStudy?: string;
  bio?: string;
  creditBalance: number;
  skillsToTeach: Skill[];
  skillsToLearn: string[];
}

const AddSkillModal = ({ modalType, onClose, onSubmit }: ModalProps) => {
  const [formData, setFormData] = useState<Skill>({
    skillName: '',
    level: modalType === 'teach' ? 'Beginner' : undefined,
    creditsPerHour: modalType === 'teach' ? 1 : undefined,
    description: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.skillName.trim()) {
      setError('Skill name is required');
      return;
    }

    if (modalType === 'teach' && (!formData.level || !formData.creditsPerHour || !formData.description?.trim())) {
      setError('Level, credits per hour and a description are required for teaching skills');
      return;
    }

    onSubmit(formData);
    onClose();
  };

  const title = modalType === 'teach' ? 'Add Skill to Teach' : 'Add Skill to Learn';
  const subtitle = modalType === 'teach' 
    ? 'Add a skill you can teach others to earn credits'
    : 'Add a skill you want to learn from others';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            <p className="modal-subtitle">{subtitle}</p>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <form className="modal-form" onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="skillName" className="form-label">Skill Name</label>
            <input 
              id="skillName" 
              type="text" 
              placeholder="e.g., Guitar, Python, Spanish" 
              className="modal-input"
              value={formData.skillName}
              onChange={(e) => setFormData({ ...formData, skillName: e.target.value })}
            />
          </div>

          {modalType === 'teach' && (
            <>
              <div className="form-group">
                <label htmlFor="level" className="form-label">Proficiency Level</label>
                <select 
                  id="level" 
                  className="modal-select"
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="credits" className="form-label">Credits Per Hour</label>
                <select 
                  id="credits" 
                  className="modal-select"
                  value={formData.creditsPerHour}
                  onChange={(e) => setFormData({ ...formData, creditsPerHour: Number(e.target.value) })}
                >
                  <option value={1}>1 credit (Standard)</option>
                  <option value={2}>2 credits</option>
                  <option value={3}>3 credits</option>
                </select>
                <p className="form-helper-text">Typically 1 credit, but experts can charge 2-3 credits</p>
              </div>

              <div className="form-group">
                <label htmlFor="description" className="form-label">Description</label>
                <textarea 
                  id="description" 
                  placeholder="Describe what you'll teach..." 
                  className="modal-textarea"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                ></textarea>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-submit">
              Add Skill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'teach' | 'learn'>('teach');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    college: '',
    yearOfStudy: '',
    bio: ''
  });
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        const config = {
          headers: { Authorization: `Bearer ${token}` }
        };
        const response = await axios.get('/profile', config);
        setProfile(response.data);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user, token, navigate]);

  const handleAddSkill = async (skill: Skill) => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      if (modalType === 'teach') {
        const response = await axios.post('/profile/skills/teach', skill, config);
        setProfile(prev => prev ? {
          ...prev,
          skillsToTeach: response.data
        } : null);
      } else {
        const response = await axios.post('/profile/skills/learn', { skillName: skill.skillName }, config);
        setProfile(prev => prev ? {
          ...prev,
          skillsToLearn: response.data
        } : null);
      }
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  // 'teach' removes by skill id, 'learn' removes by skill name.
  const handleRemoveSkill = async (idOrName: string, type: 'teach' | 'learn') => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      if (type === 'teach') {
        const response = await axios.delete(`/profile/skills/teach/${idOrName}`, config);
        setProfile(prev => prev ? {
          ...prev,
          skillsToTeach: response.data
        } : null);
      } else {
        const response = await axios.delete(`/profile/skills/learn/${encodeURIComponent(idOrName)}`, config);
        setProfile(prev => prev ? {
          ...prev,
          skillsToLearn: response.data
        } : null);
      }
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const handleEditClick = () => {
    if (profile) {
      setEditForm({
        name: profile.name,
        college: profile.college || '',
        yearOfStudy: profile.yearOfStudy || '',
        bio: profile.bio || ''
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };
      
      const response = await axios.put('/profile', editForm, config);
      setProfile(prev => prev ? {
        ...prev,
        name: response.data.name,
        college: response.data.college,
        yearOfStudy: response.data.yearOfStudy,
        bio: response.data.bio
      } : null);
      setIsEditing(false);
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({
      name: '',
      college: '',
      yearOfStudy: '',
      bio: ''
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!profile) {
    return <div>Profile not found</div>;
  }

  return (
    <div className="profile-page-container">
      <div className="profile-page-content">
        <div className="page-heading">
          <h1>My Profile</h1>
          <p>Manage your teaching and learning journey</p>
        </div>

        <div className="profile-card">
          <div className="profile-card-header">
            <h2>Profile Information</h2>
            {!isEditing ? (
              <button className="edit-btn" onClick={handleEditClick}>
                <span>Edit</span>
              </button>
            ) : (
              <div className="edit-actions">
                <button className="save-btn" onClick={handleSaveEdit}>
                  <span>Save</span>
                </button>
                <button className="cancel-btn" onClick={handleCancelEdit}>
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
          <div className="profile-info-content">
            <div className="profile-avatar">
              <span>{getInitials(profile.name)}</span>
            </div>
            <div className="profile-details-grid">
              <div className="detail-item">
                <label>Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="edit-input"
                  />
                ) : (
                  <p>{profile.name}</p>
                )}
              </div>
              <div className="detail-item">
                <label>Email</label>
                <p>{profile.email}</p>
              </div>
              <div className="detail-item">
                <label>College</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.college}
                    onChange={(e) => setEditForm({...editForm, college: e.target.value})}
                    className="edit-input"
                    placeholder="Enter your college"
                  />
                ) : (
                  <p>{profile.college || '-'}</p>
                )}
              </div>
              <div className="detail-item">
                <label>Year of Study</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.yearOfStudy}
                    onChange={(e) => setEditForm({...editForm, yearOfStudy: e.target.value})}
                    className="edit-input"
                    placeholder="e.g., 1st Year, 2nd Year"
                  />
                ) : (
                  <p>{profile.yearOfStudy || '-'}</p>
                )}
              </div>
              <div className="detail-item full-span">
                <label>Bio</label>
                {isEditing ? (
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                    className="edit-textarea"
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                ) : (
                  <p>{profile.bio || '-'}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-card-header">
            <h2 className="skills-card-title">
                            <span>Skills I Can Teach</span>
            </h2>
            <button 
              className="add-skill-btn"
              onClick={() => {
                setModalType('teach');
                setIsModalOpen(true);
              }}
            >
              <span>+ Add Skill</span>
            </button>
          </div>

          <div className="skills-list">
            {profile.skillsToTeach.map((skill) => (
              <div key={skill.id} className="skill-item-teach">
                <div className="skill-item-header">
                  <h3>{skill.skillName}</h3>
                  <button
                    className="skill-item-close-btn"
                    onClick={() => skill.id && handleRemoveSkill(skill.id, 'teach')}
                  >
                    ×
                  </button>
                </div>
                <div className="skill-item-details">
                  <span className="skill-tag">{skill.level}</span>
                  <span className="skill-tag credits">
                                        <span>{skill.creditsPerHour} credits/hr</span>
                  </span>
                </div>
                <p className="skill-description">{skill.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-card-header">
            <h2 className="skills-card-title">
                            <span>Skills I Want to Learn</span>
            </h2>
            <button 
              className="add-skill-btn"
              onClick={() => {
                setModalType('learn');
                setIsModalOpen(true);
              }}
            >
              <span>+ Add Skill</span>
            </button>
          </div>

          <div className="skills-list-learn">
            {profile.skillsToLearn.map((skillName) => (
              <div key={skillName} className="skill-tag-learn">
                <span>{skillName}</span>
                <button
                  className="skill-tag-close-btn"
                  onClick={() => handleRemoveSkill(skillName, 'learn')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="reviews-section">
          <ReviewsList userId={user?.id || ''} userName={profile?.name} />
        </div>
      </div>

      {isModalOpen && (
        <AddSkillModal
          modalType={modalType}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleAddSkill}
        />
      )}
    </div>
  );
};

export default ProfilePage;