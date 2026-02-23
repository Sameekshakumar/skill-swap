import { useState, useEffect } from 'react';
import axios from '../../utils/axios';
import './ReviewsList.css';

interface Review {
  _id: string;
  reviewer: {
    _id: string;
    name: string;
  };
  rating: number;
  comment?: string;
  skill: string;
  createdAt: string;
}

interface ReviewsListProps {
  userId: string;
  userName?: string;
}

const ReviewsList = ({ userId, userName }: ReviewsListProps) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await axios.get(`/reviews/user/${userId}`);
        setReviews(response.data);

        if (response.data.length > 0) {
          const avg =
            response.data.reduce((sum: number, r: Review) => sum + r.rating, 0) /
            response.data.length;
          setAverageRating(Math.round(avg * 10) / 10);
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [userId]);

  const renderStars = (rating: number) => {
    return (
      <div className="star-display">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={`star ${rating >= star ? 'filled' : 'empty'}`}>
            ⭐
          </span>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="reviews-loading">Loading reviews...</div>;
  }

  if (reviews.length === 0) {
    return (
      <div className="reviews-empty">
        <p>No reviews yet</p>
      </div>
    );
  }

  return (
    <div className="reviews-container">
      <div className="reviews-header">
        <div className="reviews-title-row">
          <h2>Reviews{userName && ` for ${userName}`}</h2>
        </div>
        {reviews.length > 0 && (
          <div className="rating-badge">
            <div className="rating-number">{averageRating}</div>
            {renderStars(averageRating)}
            <div className="rating-meta">({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</div>
          </div>
        )}
      </div>

      {reviews.length > 0 && (
        <div className="reviews-list">
          {reviews.map((review) => (
            <div key={review._id} className="review-card">
              <div className="review-header">
                <div className="reviewer-info">
                  <h4 className="reviewer-name">{review.reviewer.name}</h4>
                  <span className="review-skill">{review.skill}</span>
                </div>
                <div className="review-rating">{renderStars(review.rating)}</div>
              </div>

              {review.comment && (
                <p className="review-comment">{review.comment}</p>
              )}

              <p className="review-date">
                {new Date(review.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewsList;
