import { useState } from 'react';
import axios from '../../utils/axios';
import { handleApiError } from '../../utils/helpers';
import './ReviewModal.css';

interface ReviewModalProps {
  isOpen: boolean;
  bookingId: string;
  revieweeName: string;
  skill: string;
  onClose: () => void;
  onSubmit: () => void;
}

const ReviewModal = ({
  isOpen,
  bookingId,
  revieweeName,
  skill,
  onClose,
  onSubmit
}: ReviewModalProps) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post('/reviews', {
        bookingId,
        rating,
        comment: comment.trim() || null
      });

      setComment('');
      setRating(5);
      onSubmit();
      onClose();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="review-modal-overlay">
      <div className="review-modal">
        <div className="review-modal-header">
          <h2>Review {revieweeName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="review-modal-body">
          <p className="skill-tag">Skill: <strong>{skill}</strong></p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Rating</label>
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`star ${rating >= star ? 'active' : ''}`}
                    onClick={() => setRating(star)}
                    aria-label={`${star} out of 5`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p className="rating-text">{rating} out of 5 stars</p>
            </div>

            <div className="form-group">
              <label htmlFor="comment">Comment (optional)</label>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience..."
                maxLength={500}
                rows={4}
              />
              <p className="char-count">{comment.length}/500</p>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="button-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
