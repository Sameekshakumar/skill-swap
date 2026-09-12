const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { HttpError, sendError } = require('../lib/httpError');

const MAX_COMMENT = 500;

// Matches the old `.populate('reviewer', 'name')`.
const reviewerName = { reviewer: { select: { id: true, name: true } } };

// Submit a review for someone
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    // Validate rating
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    if (comment && comment.length > MAX_COMMENT) {
      return res.status(400).json({ error: `Comment must be ${MAX_COMMENT} characters or fewer` });
    }

    const review = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new HttpError(404, 'Booking not found');
      }

      // Check if the reviewer is part of this booking
      if (booking.teacherId !== req.user.id && booking.learnerId !== req.user.id) {
        throw new HttpError(403, 'You can only review bookings you participated in');
      }

      // Only completed sessions are reviewable — otherwise a learner could
      // request a session and immediately rate the teacher.
      if (booking.status !== 'Completed') {
        throw new HttpError(400, 'You can only review a completed session');
      }

      // Determine who is being reviewed
      const revieweeId = booking.teacherId === req.user.id ? booking.learnerId : booking.teacherId;

      // Lock the reviewee so two reviews landing at once cannot both compute
      // the average from a stale set of rows.
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${revieweeId} FOR UPDATE`;

      const created = await tx.review.create({
        data: {
          reviewerId: req.user.id,
          revieweeId,
          bookingId,
          rating,
          comment: comment?.trim(),
          skill: booking.skill
        }
      });

      // Recompute the reviewee's aggregate from the table rather than nudging it.
      const stats = await tx.review.aggregate({
        where: { revieweeId },
        _avg: { rating: true },
        _count: true
      });

      await tx.user.update({
        where: { id: revieweeId },
        data: {
          rating: Math.round(stats._avg.rating * 10) / 10, // Round to 1 decimal
          reviewCount: stats._count
        }
      });

      return created;
    });

    res.status(201).json({
      message: 'Review submitted successfully',
      review
    });
  } catch (err) {
    // The @@unique([bookingId, reviewerId]) constraint is what actually
    // prevents a second review, including under a race.
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'You have already reviewed this person for this booking' });
    }
    sendError(res, err, 'Server error');
  }
});

// Get reviews for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { revieweeId: req.params.userId },
      include: reviewerName,
      orderBy: { createdAt: 'desc' }
    });

    res.json(reviews);
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

// Get reviews given by the current user
router.get('/my-reviews', auth, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { reviewerId: req.user.id },
      include: {
        reviewee: { select: { id: true, name: true, email: true } },
        booking: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reviews);
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

// Get reviews received by the current user
router.get('/received', auth, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { revieweeId: req.user.id },
      include: reviewerName,
      orderBy: { createdAt: 'desc' }
    });

    res.json(reviews);
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

// Get pending reviews (completed bookings without reviews)
router.get('/pending', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // One query instead of the old per-booking lookups: pull each completed
    // booking along with this user's review of it, if any.
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'Completed',
        OR: [
          { teacherId: userId, completedByTeacher: true },
          { learnerId: userId, completedByLearner: true }
        ]
      },
      include: {
        reviews: { where: { reviewerId: userId }, select: { id: true } },
        teacher: { select: { id: true, name: true } },
        learner: { select: { id: true, name: true } }
      },
      orderBy: { dateTime: 'desc' }
    });

    const pendingReviews = bookings
      .filter((booking) => booking.reviews.length === 0)
      .map((booking) => {
        const reviewee = booking.teacherId === userId ? booking.learner : booking.teacher;
        return {
          bookingId: booking.id,
          revieweeId: reviewee.id,
          revieweeName: reviewee.name,
          skill: booking.skill,
          datetime: booking.dateTime
        };
      });

    res.json(pendingReviews);
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

module.exports = router;
