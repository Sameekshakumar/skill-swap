import { useState, useEffect } from 'react';
import axios from '../../utils/axios';
import ReviewModal from './ReviewModal';
import './PendingReviews.css';

interface PendingReview {
  bookingId: string;
  revieweeId: string;
  revieweeName: string;
  skill: string;
  datetime: string;
}

interface PendingReviewsProps {
  token: string;
}

const PendingReviews = ({ token }: PendingReviewsProps) => {
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchPendingReviews = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const response = await axios.get('/reviews/pending', config);
      setPendingReviews(response.data);
    } catch (error) {
      console.error('Error fetching pending reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingReviews();
  }, [token]);

  const handleReviewClick = (review: PendingReview) => {
    setSelectedReview(review);
    setIsModalOpen(true);
  };

  const handleReviewSubmitted = () => {
    fetchPendingReviews();
  };

  if (loading) {
    return <div className="pending-reviews-loading">Loading...</div>;
  }

  if (pendingReviews.length === 0) {
    return null;
  }

  return (
    <>
      <div className="pending-reviews-container">
        <div className="pending-reviews-header">
          <h3>
            Pending Reviews
            <span className="review-count">{pendingReviews.length}</span>
          </h3>
          <p className="pending-reviews-subtitle">
            You have completed sessions waiting for your review
          </p>
        </div>

        <div className="pending-reviews-list">
          {pendingReviews.map((review) => (
            <div key={review.bookingId} className="pending-review-item">
              <div className="review-info">
                <h4 className="reviewee-name">{review.revieweeName}</h4>
                <p className="review-skill">Skill: {review.skill}</p>
                <p className="review-date">
                  Session: {new Date(review.datetime).toLocaleDateString()}
                </p>
              </div>
              <button
                className="btn btn-small"
                onClick={() => handleReviewClick(review)}
              >
                Leave Review
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedReview && (
        <ReviewModal
          isOpen={isModalOpen}
          bookingId={selectedReview.bookingId}
          revieweeName={selectedReview.revieweeName}
          skill={selectedReview.skill}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReview(null);
          }}
          onSubmit={handleReviewSubmitted}
        />
      )}
    </>
  );
};

export default PendingReviews;
