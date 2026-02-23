const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Review = require('../models/Review');
const User = require('../models/User');
const Booking = require('../models/Booking');

// Submit a review for someone
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if the reviewer is part of this booking
    if (booking.teacher.toString() !== req.user.id && booking.learner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You can only review bookings you participated in' });
    }

    // Determine who is being reviewed
    const revieweeId = booking.teacher.toString() === req.user.id ? booking.learner : booking.teacher;

    // Check if review already exists
    const existingReview = await Review.findOne({
      reviewer: req.user.id,
      reviewee: revieweeId,
      booking: bookingId
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this person for this booking' });
    }

    // Create the review
    const review = new Review({
      reviewer: req.user.id,
      reviewee: revieweeId,
      booking: bookingId,
      rating,
      comment,
      skill: booking.skill
    });

    await review.save();

    // Update reviewee's rating
    const allReviews = await Review.find({ reviewee: revieweeId });
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalRating / allReviews.length;

    await User.findByIdAndUpdate(revieweeId, {
      rating: Math.round(avgRating * 10) / 10, // Round to 1 decimal
      reviewCount: allReviews.length
    });

    res.status(201).json({
      message: 'Review submitted successfully',
      review
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'name')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews given by the current user
router.get('/my-reviews', auth, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer: req.user.id })
      .populate('reviewee', 'name email')
      .populate('booking')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews received by the current user
router.get('/received', auth, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewee: req.user.id })
      .populate('reviewer', 'name')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending reviews (completed bookings without reviews)
router.get('/pending', auth, async (req, res) => {
  try {
    // Find completed bookings where the user hasn't reviewed the other person
    const bookings = await Booking.find({
      $or: [
        { teacher: req.user.id, completedByTeacher: true },
        { learner: req.user.id, completedByLearner: true }
      ],
      status: 'Completed'
    });

    const pendingReviews = [];

    for (const booking of bookings) {
      const revieweeId = booking.teacher.toString() === req.user.id ? booking.learner : booking.teacher;
      
      const existingReview = await Review.findOne({
        reviewer: req.user.id,
        reviewee: revieweeId,
        booking: booking._id
      });

      if (!existingReview) {
        const reviewee = await User.findById(revieweeId);
        pendingReviews.push({
          bookingId: booking._id,
          revieweeId: reviewee._id,
          revieweeName: reviewee.name,
          skill: booking.skill,
          datetime: booking.dateTime
        });
      }
    }

    res.json(pendingReviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
