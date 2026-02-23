import React, { useState } from 'react';
import './RequestSessionModal.css';

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
}

interface RequestSessionModalProps {
  teacher: Teacher;
  onClose: () => void;
  onSubmit: (data: { teacherId: string; skill: string; dateTime: string; duration: number; notes: string; creditsPerHour: number }) => void;
}

export default function RequestSessionModal({ teacher, onClose, onSubmit }: RequestSessionModalProps) {
  const [dateTime, setDateTime] = useState('');
  const [duration, setDuration] = useState(1);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateTime) {
      alert('Please select a date and time');
      return;
    }

    onSubmit({
      teacherId: teacher.id,
      skill: teacher.skill,
      dateTime,
      duration,
      notes,
      creditsPerHour: teacher.creditRate
    });
  };

  // Get tomorrow's date as minimum for date picker
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content request-session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Request Session</h2>
            <p className="modal-subtitle">Schedule a learning session with {teacher.name}</p>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="skill" className="form-label">Skill to Learn</label>
            <input 
              id="skill" 
              type="text" 
              value={teacher.skill}
              className="modal-input"
              disabled
            />
          </div>

          <div className="form-group">
            <label htmlFor="dateTime" className="form-label">Date & Time</label>
            <input 
              id="dateTime" 
              type="datetime-local" 
              className="modal-input"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
              min={minDate}
            />
          </div>

          <div className="form-group">
            <label htmlFor="duration" className="form-label">Duration (hours)</label>
            <select 
              id="duration" 
              className="modal-select"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
            >
              <option value={0.5}>0.5 hours</option>
              <option value={1}>1 hour</option>
              <option value={1.5}>1.5 hours</option>
              <option value={2}>2 hours</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes" className="form-label">Additional Notes (optional)</label>
            <textarea 
              id="notes" 
              placeholder="Any specific topics or areas you'd like to focus on..." 
              className="modal-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            ></textarea>
          </div>

          <div className="credit-summary">
            <div className="credit-summary-row">
              <span>Rate per hour:</span>
              <span className="credit-amount">{teacher.creditRate} credits</span>
            </div>
            <div className="credit-summary-row">
              <span>Duration:</span>
              <span className="credit-amount">{duration} hour{duration !== 1 ? 's' : ''}</span>
            </div>
            <div className="credit-summary-row total">
              <span>Total cost:</span>
              <span className="credit-amount">{teacher.creditRate * duration} credits</span>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-submit">
              Request Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

