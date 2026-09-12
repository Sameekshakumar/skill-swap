import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../contexts/FeedbackContext';
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
}

export default function SearchPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [filters, setFilters] = useState({
    skillLevel: 'all',
    creditRate: 'all',
    minRating: 'all'
  });
  const { refreshUser } = useAuth();
  const { notify } = useFeedback();

  const toTeacher = (row: any): Teacher => ({
    id: row.teacherId,
    skillId: row.skillId,
    name: row.teacherName,
    university: row.teacherCollege || 'Unknown',
    year: row.teacherYear || '',
    skill: row.skillName,
    proficiency: row.level,
    creditRate: row.creditsPerHour,
    rating: row.teacherRating || 0,
    reviews: row.teacherReviews || 0,
    bio: row.description || row.teacherBio || 'No description available',
    imageUrl: row.teacherAvatar
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(row.teacherName)}&background=022f49&color=fff&size=150`
  });

  const buildParams = (nextPage: number) => {
    const params: Record<string, string> = { page: String(nextPage) };
    if (searchQuery.trim()) params.query = searchQuery.trim();
    if (filters.skillLevel !== 'all') params.level = filters.skillLevel;
    if (filters.creditRate !== 'all') params.maxRate = filters.creditRate;
    if (filters.minRating !== 'all') params.minRating = filters.minRating;
    return params;
  };

  // The search text is debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const response = await axios.get('/users/teachers/search', { params: buildParams(1) });
        setTeachers(response.data.results.map(toTeacher));
        setTotal(response.data.total);
        setHasMore(response.data.hasMore);
        setPage(1);
      } catch (error) {
        setLoadError(handleApiError(error));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters.skillLevel, filters.creditRate, filters.minRating]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await axios.get('/users/teachers/search', { params: buildParams(page + 1) });
      setTeachers((current) => [...current, ...response.data.results.map(toTeacher)]);
      setHasMore(response.data.hasMore);
      setPage((current) => current + 1);
    } catch (error) {
      notify(handleApiError(error), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRequestSession = async (requestData: { teacherId: string; skillId: string; skill: string; dateTime: string; duration: number; notes: string; creditsPerHour: number }) => {
    setIsRequesting(true);
    try {
      await axios.post('/bookings', {
        teacherId: requestData.teacherId,
        skillId: requestData.skillId,
        skill: requestData.skill,
        dateTime: requestData.dateTime,
        duration: requestData.duration,
        notes: requestData.notes,
        creditsPerHour: requestData.creditsPerHour
      });

      // Refresh credit balance after successful booking
      await refreshUser();

      setIsRequestModalOpen(false);
      setSelectedTeacher(null);
      notify('Session request sent.');
    } catch (error: any) {
      console.error('Error requesting session:', error);
      notify(handleApiError(error), 'error');
    } finally {
      setIsRequesting(false);
    }
  };

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
            Showing {teachers.length} of {total} {total === 1 ? 'result' : 'results'}
          </div>

          {/* Teacher Cards */}
          <div className="teachers-grid">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : loadError ? (
              <div className="loading">{loadError}</div>
            ) : teachers.length === 0 ? (
              <div className="loading">
                {teachers.length === 0
                  ? 'Nobody is offering skills yet. Add one on your profile to be the first.'
                  : 'No teachers match your search.'}
              </div>
            ) : (
              teachers.map((teacher) => (
                <div key={teacher.skillId} className="teacher-card">
                  <div className="card-header">
                    <div className="teacher-info">
                      <img 
                        src={teacher.imageUrl} 
                        alt={teacher.name}
                        className="teacher-avatar"
                      />
                      <div className="teacher-details">
                        <Link to={`/teachers/${teacher.id}`} className="teacher-name-link">
                          <h3 className="teacher-name">{teacher.name}</h3>
                        </Link>
                        <p className="teacher-university">{teacher.university} • {teacher.year}</p>
                      </div>
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

          {hasMore && (
            <div className="load-more-row">
              <button
                type="button"
                className="load-more-btn"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show more teachers'}
              </button>
            </div>
          )}
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
