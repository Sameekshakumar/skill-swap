import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from '../utils/axios';
import { handleApiError } from '../utils/helpers';
import PendingReviews from '../components/reviews/PendingReviews';
import './DashboardPage.css';

interface Booking {
  id: string;
  teacher: { id: string; name: string; email: string };
  learner: { id: string; name: string; email: string };
  skill: string;
  status: string;
  creditAmount: number;
  dateTime: string;
  duration: number;
  completedByLearner: boolean;
  completedByTeacher: boolean;
  notes?: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('requests');
  const [creditBalance, setCreditBalance] = useState(user?.creditBalance || 10);
  
  const [requests, setRequests] = useState<Booking[]>([]);
  const [myRequests, setMyRequests] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [completed, setCompleted] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const tabs = [
    { id: 'requests', label: 'Session Requests' },
    { id: 'my-requests', label: 'My Requests' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' }
  ];

  const fetchBookings = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const [requestsRes, myRequestsRes, upcomingRes, completedRes, profileRes] = await Promise.all([
        axios.get('/bookings/requests', config),
        axios.get('/bookings/my-requests', config),
        axios.get('/bookings/upcoming', config),
        axios.get('/bookings/completed', config),
        axios.get('/profile', config)
      ]);

      setRequests(requestsRes.data);
      setMyRequests(myRequestsRes.data);
      setUpcoming(upcomingRes.data);
      setCompleted(completedRes.data);
      setCreditBalance(profileRes.data.creditBalance);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // First, cleanup any orphaned bookings and refund credits
    const cleanupAndFetch = async () => {
      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const response = await axios.get('/bookings/cleanup-orphaned', config);
        if (response.data.creditsRefunded > 0) {
          console.log(`Credits refunded: ${response.data.creditsRefunded}`);
          // Refresh user data to update credit balance
          window.location.reload();
          return;
        }
      } catch (error) {
        console.log('No orphaned bookings to clean up');
      }
      // Then fetch bookings
      fetchBookings();
    };
    
    cleanupAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAccept = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`/bookings/${bookingId}/accept`, {}, config);
      await fetchBookings();
      alert('Session request accepted!');
    } catch (error) {
      alert(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to reject this session request?')) return;
    
    setActionLoading(bookingId);
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`/bookings/${bookingId}/reject`, {}, config);
      await fetchBookings();
      alert('Session request rejected.');
    } catch (error) {
      alert(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this session?')) return;
    
    setActionLoading(bookingId);
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`/bookings/${bookingId}/cancel`, {}, config);
      await fetchBookings(); // This will refresh credit balance
      alert('Session cancelled. Credits refunded.');
    } catch (error) {
      alert(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (bookingId: string, completedBy: 'learner' | 'teacher') => {
    setActionLoading(bookingId);
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`/bookings/${bookingId}/complete`, { completedBy }, config);
      await fetchBookings(); // This will refresh credit balance
      alert('Session completion status updated.');
    } catch (error) {
      alert(handleApiError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const BookingCard = ({ booking, userType }: { booking: Booking; userType: 'teacher' | 'learner' }) => {
    const isTeacher = userType === 'teacher';
    const otherPerson = isTeacher ? booking.learner : booking.teacher;

    return (
      <div className="booking-card">
        <div className="booking-header">
          <div>
            <h3 className="booking-skill">{booking.skill}</h3>
            <p className="booking-person">
              {isTeacher ? `Learner:` : `Teacher:`} {otherPerson.name}
            </p>
          </div>
          <div className={`booking-status ${booking.status.toLowerCase()}`}>
            {booking.status}
          </div>
        </div>
        
        <div className="booking-details">
          <div className="booking-detail-item">
            <span className="detail-label">📅</span>
            <span>{formatDateTime(booking.dateTime)}</span>
          </div>
          <div className="booking-detail-item">
            <span className="detail-label">⏱️</span>
            <span>{booking.duration} hour{booking.duration !== 1 ? 's' : ''}</span>
          </div>
          <div className="booking-detail-item">
            <span className="detail-label">💳</span>
            <span>{booking.creditAmount} credits</span>
          </div>
        </div>

        {booking.notes && (
          <div className="booking-notes">
            <strong>Notes:</strong> {booking.notes}
          </div>
        )}

        <div className="booking-actions">
          {booking.status === 'Requested' && isTeacher && (
            <>
              <button 
                className="action-btn accept-btn"
                onClick={() => handleAccept(booking.id)}
                disabled={actionLoading === booking.id}
              >
                Accept
              </button>
              <button 
                className="action-btn reject-btn"
                onClick={() => handleReject(booking.id)}
                disabled={actionLoading === booking.id}
              >
                Reject
              </button>
            </>
          )}
          
          {booking.status === 'Requested' && !isTeacher && (
            <button 
              className="action-btn cancel-btn"
              onClick={() => handleCancel(booking.id)}
              disabled={actionLoading === booking.id}
            >
              Cancel Request
            </button>
          )}

          {booking.status === 'Confirmed' && (
            <button 
              className="action-btn complete-btn"
              onClick={() => handleComplete(booking.id, isTeacher ? 'teacher' : 'learner')}
              disabled={actionLoading === booking.id}
            >
              {isTeacher ? booking.completedByTeacher ? '✓ Marked Complete by You' : 'Mark Complete' 
                       : booking.completedByLearner ? '✓ Marked Complete by You' : 'Mark Complete'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="sessions-page-container">
      <div className="sessions-page-content">
        {/* Header */}
        <div className="sessions-header">
          <div className="header-left">
            <div className="header-title">
              <span className="calendar-icon">📅</span>
              <h1>My Sessions</h1>
            </div>
            <p className="header-subtitle">Manage your bookings and sessions</p>
          </div>
          <div className="header-actions">
            <div className="credit-balance-btn">
              <span>💳</span>
              <span>{creditBalance} credits</span>
            </div>
            <Link to="/" className="header-btn">
              <span>👁️</span>
              <span>Discover</span>
            </Link>
            <Link to="/profile" className="header-btn">
              <span>👤</span>
              <span>Profile</span>
            </Link>
            <button onClick={logout} className="header-btn">
              <span>↗️</span>
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="sessions-main-card">
          {/* Pending Reviews Alert */}
          {token && <PendingReviews token={token} />}
          {/* Tabs */}
          <div className="tabs-container">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <>
                {activeTab === 'requests' && (
                  <div className="requests-section">
                    <div className="section-header">
                      <div className="section-title">
                        <span className="section-icon">⚠️</span>
                        <h2>Session Requests</h2>
                      </div>
                      <p className="section-description">Students requesting to learn from you.</p>
                    </div>
                    
                    {requests.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">🕐</div>
                        <h3>No pending requests</h3>
                        <p>When students request sessions with you, they'll appear here.</p>
                      </div>
                    ) : (
                      <div className="bookings-grid">
                        {requests.map(booking => (
                          <BookingCard key={booking.id} booking={booking} userType="teacher" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'my-requests' && (
                  <div className="my-requests-section">
                    <div className="section-header">
                      <div className="section-title">
                        <span className="section-icon">📤</span>
                        <h2>My Requests</h2>
                      </div>
                      <p className="section-description">Sessions you've requested from other teachers.</p>
                    </div>
                    
                    {myRequests.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📝</div>
                        <h3>No requests sent</h3>
                        <p>When you request sessions with teachers, they'll appear here.</p>
                      </div>
                    ) : (
                      <div className="bookings-grid">
                        {myRequests.map(booking => (
                          <BookingCard key={booking.id} booking={booking} userType="learner" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'upcoming' && (
                  <div className="upcoming-section">
                    <div className="section-header">
                      <div className="section-title">
                        <span className="section-icon">📅</span>
                        <h2>Upcoming Sessions</h2>
                      </div>
                      <p className="section-description">Your confirmed sessions.</p>
                    </div>
                    
                    {upcoming.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">⏰</div>
                        <h3>No upcoming sessions</h3>
                        <p>Your scheduled sessions will appear here.</p>
                      </div>
                    ) : (
                      <div className="bookings-grid">
                        {upcoming.map(booking => (
                          <BookingCard key={booking.id} booking={booking} userType={user?.id === booking.teacher.id ? 'teacher' : 'learner'} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'completed' && (
                  <div className="completed-section">
                    <div className="section-header">
                      <div className="section-title">
                        <span className="section-icon">✅</span>
                        <h2>Completed Sessions</h2>
                      </div>
                      <p className="section-description">Your finished sessions.</p>
                    </div>
                    
                    {completed.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">🎉</div>
                        <h3>No completed sessions</h3>
                        <p>Your completed sessions will appear here.</p>
                      </div>
                    ) : (
                      <div className="bookings-grid">
                        {completed.map(booking => (
                          <BookingCard key={booking.id} booking={booking} userType={user?.id === booking.teacher.id ? 'teacher' : 'learner'} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
