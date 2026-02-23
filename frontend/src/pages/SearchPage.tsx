import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RequestSessionModal from '../components/bookings/RequestSessionModal';
import axios from '../utils/axios';
import { handleApiError } from '../utils/helpers';
import './SearchPage.css';

interface Teacher {
  id: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [creditBalance, setCreditBalance] = useState(10);
  const [filters, setFilters] = useState({
    skillLevel: 'all',
    creditRate: 'all',
    availability: 'all',
    minRating: 'all'
  });
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  // Mock data for demonstration
  const mockTeachers: Teacher[] = [
    {
      id: '1',
      name: 'Sarah Johnson',
      university: 'MIT',
      year: '4th Year',
      skill: 'Guitar',
      proficiency: 'Advanced',
      creditRate: 2,
      rating: 4.9,
      reviews: 45,
      bio: 'Passionate about teaching guitar and helping students find their musical voice. Teaching acoustic and electric guitar for all levels. Specializing in fingerstyle and music theory.',
      imageUrl: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
      available: true
    },
    {
      id: '2',
      name: 'Sarah Johnson',
      university: 'MIT',
      year: '4th Year',
      skill: 'Music Theory',
      proficiency: 'Advanced',
      creditRate: 2,
      rating: 4.8,
      reviews: 32,
      bio: 'Passionate about teaching guitar and helping students find their musical voice. Comprehensive music theory from basics to advanced composition.',
      imageUrl: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
      available: true
    },
    {
      id: '3',
      name: 'Elena Rodriguez',
      university: 'UC Berkeley',
      year: '3rd Year',
      skill: 'Spanish',
      proficiency: 'Advanced',
      creditRate: 2,
      rating: 4.9,
      reviews: 89,
      bio: 'Native Spanish speaker from Madrid. Teaching Spanish and European culture. Conversational Spanish, grammar, and cultural immersion. Perfect for beginners to advanced.',
      imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
      available: true
    },
    {
      id: '4',
      name: 'James Anderson',
      university: 'Harvard University',
      year: 'Postgraduate',
      skill: 'Data Science',
      proficiency: 'Advanced',
      creditRate: 3,
      rating: 4.7,
      reviews: 41,
      bio: 'Data scientist passionate about making machine learning accessible to everyone. Machine learning, statistics, and data visualization using Python and R.',
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      available: true
    },
    {
      id: '5',
      name: 'James Anderson',
      university: 'Harvard University',
      year: 'Postgraduate',
      skill: 'Statistics',
      proficiency: 'Advanced',
      creditRate: 2,
      rating: 4.8,
      reviews: 35,
      bio: 'Data scientist passionate about making machine learning accessible to everyone. Applied statistics for data analysis and research.',
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      available: true
    },
    {
      id: '6',
      name: 'Priya Sharma',
      university: 'Yale University',
      year: '2nd Year',
      skill: 'Yoga',
      proficiency: 'Intermediate',
      creditRate: 1,
      rating: 4.9,
      reviews: 52,
      bio: 'Yoga instructor and wellness enthusiast. Teaching mindfulness and healthy living. Beginner-friendly yoga sessions focusing on flexibility, strength, and mindfulness.',
      imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
      available: true
    }
  ];

  useEffect(() => {
    // Fetch profile to get updated credit balance
    const fetchProfile = async () => {
      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const profileResponse = await axios.get('/profile', config);
        setCreditBalance(profileResponse.data.creditBalance);
      } catch (error) {
        console.log('Could not fetch profile');
      }
    };
    
    fetchProfile();
  }, [token]);

  useEffect(() => {
    // Try to fetch real teachers from API, fall back to mock data
    const fetchTeachers = async () => {
      try {
        const response = await axios.get('/users/teachers/search');
        if (response.data && response.data.length > 0) {
          // Transform API data to match Teacher interface
          const realTeachers = response.data.map((skill: any) => ({
            id: skill.teacherId,
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
        } else {
          // Fall back to mock data
          setTeachers(mockTeachers);
        }
      } catch (error) {
        console.log('Could not fetch real teachers, using mock data:', error);
        // Fall back to mock data
        setTeachers(mockTeachers);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTeachers();
  }, []);

  const handleRequestSession = async (requestData: { teacherId: string; skill: string; dateTime: string; duration: number; notes: string; creditsPerHour: number }) => {
    setIsRequesting(true);
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };
      
      await axios.post('/bookings', {
        teacherId: requestData.teacherId,
        skill: requestData.skill,
        dateTime: requestData.dateTime,
        duration: requestData.duration,
        notes: requestData.notes,
        creditsPerHour: requestData.creditsPerHour
      }, config);

      // Refresh credit balance after successful booking
      const profileResponse = await axios.get('/profile', config);
      setCreditBalance(profileResponse.data.creditBalance);

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
        <div className="discover-header">
          <div className="header-left">
            <div className="header-title">
              <span className="compass-icon">🧭</span>
              <h1>Discover Skills</h1>
            </div>
            <p className="header-subtitle">Find teachers and learn new skills</p>
          </div>
          <div className="header-actions">
            <div className="credit-balance-btn">
              <span>💳</span>
              <span>{creditBalance} credits</span>
            </div>
            <Link to="/profile" className="header-btn">
              <span>👤</span>
              <span>My Profile</span>
            </Link>
            <button onClick={logout} className="header-btn">
              <span>↗️</span>
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="discover-main-card">
          {/* Search Bar */}
          <div className="search-section">
            <div className="search-bar">
              <span className="search-icon">🔍</span>
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
              <span className="filter-icon">🔽</span>
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
            ) : (
              filteredTeachers.map((teacher) => (
                <div key={teacher.id} className="teacher-card">
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
                      <span>📅</span>
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
                      <span>💳</span>
                      <span>{teacher.creditRate} credits/hr</span>
                    </span>
                    <div className="rating">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className={`star ${i < Math.floor(teacher.rating) ? 'filled' : ''}`}>
                          ⭐
                        </span>
                      ))}
                      <span className="rating-text">{teacher.rating} ({teacher.reviews})</span>
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
