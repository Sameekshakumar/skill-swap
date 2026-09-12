import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RequestSessionModal from '../components/bookings/RequestSessionModal';
import axios from '../utils/axios';
import { handleApiError } from '../utils/helpers';
import './SearchPage.css';

interface Teacher {
  id: string;
  skillId: string;
  name: string;
  university: string;
  year: string;
  skill: string;
  proficiency: string;
  creditRate: number;
  rating: number;
  reviews: number;
  bio: string;
  imageUrl: string;
  available: boolean;
}

export default function SearchPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [filters, setFilters] = useState({
    skillLevel: 'all',
    creditRate: 'all',
    availability: 'all',
    minRating: 'all'
  });
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTeachers = async () => {
      try {
        const response = await axios.get('/users/teachers/search');
        // One row per skill offered. Your own listings are dropped: you cannot
        // book yourself, so showing them would only produce a failed request.
        const realTeachers = response.data
          .filter((skill: any) => skill.teacherId !== user?.id)
          .map((skill: any) => ({
            id: skill.teacherId,
            skillId: skill.skillId,
            name: skill.teacherName,
            university: skill.teacherCollege || 'Unknown',
            year: skill.teacherYear || '',
            skill: skill.skillName,
            proficiency: skill.level,
            creditRate: skill.creditsPerHour,
            rating: skill.teacherRating || 0,
            reviews: skill.teacherReviews || 0,
            bio: skill.description || skill.teacherBio || 'No description available',
            imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(skill.teacherName)}&background=022f49&color=fff&size=150`,
            available: true
          }));
        setTeachers(realTeachers);
      } catch (error) {
        setLoadError(handleApiError(error));
      } finally {
        setLoading(false);
      }
    };

    fetchTeachers();
  }, [user?.id]);

  const handleRequestSession = async (requestData: { teacherId: string; skillId: string; skill: string; dateTime: string; duration: number; notes: string; creditsPerHour: number }) => {
    setIsRequesting(true);
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };
      
      await axios.post('/bookings', {
        teacherId: requestData.teacherId,
        skillId: requestData.skillId,
        skill: requestData.skill,
        dateTime: requestData.dateTime,
        duration: requestData.duration,
        notes: requestData.notes,
        creditsPerHour: requestData.creditsPerHour
      }, config);

      // Refresh credit balance after successful booking
      await refreshUser();

      setIsRequestModalOpen(false);
      setSelectedTeacher(null);
      alert('Session request sent successfully!');
    } catch (error: any) {
      console.error('Error requesting session:', error);
      alert(handleApiError(error));
    } finally {
      setIsRequesting(false);
    }
  };

  const filteredTeachers = teachers.filter(teacher => {
    const matchesSearch = teacher.skill.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         teacher.bio.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLevel = filters.skillLevel === 'all' || teacher.proficiency.toLowerCase() === filters.skillLevel;
    const matchesRate = filters.creditRate === 'all' || teacher.creditRate <= parseInt(filters.creditRate);
    const matchesAvailability = filters.availability === 'all' || teacher.available;
    const matchesRating = filters.minRating === 'all' || teacher.rating >= parseFloat(filters.minRating);

    return matchesSearch && matchesLevel && matchesRate && matchesAvailability && matchesRating;
  });

  return (
    <div className="discover-page-container">
      <div className="discover-page-content">
        {/* Header */}
        <div className="page-heading">
          <h1>Discover Skills</h1>
          <p>Find teachers and learn new skills</p>
        </div>

        {/* Main Content */}
        <div className="discover-main-card">
          {/* Search Bar */}
          <div className="search-section">
            <div className="search-bar">
                            <input
                type="text"
                placeholder="Search for skills, teachers, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="filters-section">
            <div className="filters-header">
                            <span>Filters</span>
            </div>
            <div className="filters-grid">
              <select
                value={filters.skillLevel}
                onChange={(e) => setFilters({...filters, skillLevel: e.target.value})}
                className="filter-select"
              >
                <option value="all">All Levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              
              <select
                value={filters.creditRate}
                onChange={(e) => setFilters({...filters, creditRate: e.target.value})}
                className="filter-select"
              >
                <option value="all">All Rates</option>
                <option value="1">1 credit</option>
                <option value="2">2 credits</option>
                <option value="3">3 credits</option>
              </select>
              
              <select
                value={filters.availability}
                onChange={(e) => setFilters({...filters, availability: e.target.value})}
                className="filter-select"
              >
                <option value="all">All</option>
                <option value="available">Available</option>
              </select>
              
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({...filters, minRating: e.target.value})}
                className="filter-select"
              >
                <option value="all">All Ratings</option>
                <option value="4.5">4.5+ stars</option>
                <option value="4.0">4.0+ stars</option>
                <option value="3.5">3.5+ stars</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="results-count">
            Showing {filteredTeachers.length} results
          </div>

          {/* Teacher Cards */}
          <div className="teachers-grid">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : loadError ? (
              <div className="loading">{loadError}</div>
            ) : filteredTeachers.length === 0 ? (
              <div className="loading">
                {teachers.length === 0
                  ? 'Nobody is offering skills yet. Add one on your profile to be the first.'
                  : 'No teachers match your search.'}
              </div>
            ) : (
              filteredTeachers.map((teacher) => (
                <div key={teacher.skillId} className="teacher-card">
                  <div className="card-header">
                    <div className="teacher-info">
                      <img 
                        src={teacher.imageUrl} 
                        alt={teacher.name}
                        className="teacher-avatar"
                      />
                      <div className="teacher-details">
                        <h3 className="teacher-name">{teacher.name}</h3>
                        <p className="teacher-university">{teacher.university} • {teacher.year}</p>
                      </div>
                    </div>
                    <div className="availability-tag">
                      
                      <span>Available</span>
                    </div>
                  </div>
                  
                  <div className="skill-tag">
                    Teaching: {teacher.skill}
                  </div>
                  
                  <p className="teacher-bio">{teacher.bio}</p>
                  
                  <div className="teacher-stats">
                    <span className="proficiency-tag">{teacher.proficiency}</span>
                    <span className="credit-rate">
                      
                      <span>{teacher.creditRate} credits/hr</span>
                    </span>
                    <div className="rating">
                      <span className="rating-text">
                        {teacher.reviews > 0
                          ? `${teacher.rating} out of 5 · ${teacher.reviews} reviews`
                          : 'No reviews yet'}
                      </span>
                    </div>
                  </div>
                  
                  <button 
                    className="request-session-btn"
                    onClick={() => {
                      // Check if this is a mock teacher (IDs like '1', '2', '3', etc.)
                      const isMockTeacher = /^[1-9]\d*$/.test(teacher.id);
                      if (isMockTeacher) {
                        alert('These are demo teachers. To request sessions with real teachers, please add teaching skills to user profiles in the system.');
                        return;
                      }
                      setSelectedTeacher(teacher);
                      setIsRequestModalOpen(true);
                    }}
                  >
                    Request Session
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isRequestModalOpen && selectedTeacher && (
        <RequestSessionModal
          teacher={selectedTeacher}
          onClose={() => {
            setIsRequestModalOpen(false);
            setSelectedTeacher(null);
          }}
          onSubmit={handleRequestSession}
        />
      )}
    </div>
  );
}
