const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { HttpError, sendError } = require('../lib/httpError');

// Matches the old `.populate('teacher', 'name email')` shape.
const participants = {
  teacher: { select: { id: true, name: true, email: true } },
  learner: { select: { id: true, name: true, email: true } }
};

// Get all bookings for the authenticated user (as teacher or learner)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const bookings = await prisma.booking.findMany({
      where: { OR: [{ teacherId: userId }, { learnerId: userId }] },
      include: participants,
      orderBy: { createdAt: 'desc' }
    });

    res.json(bookings);
  } catch (error) {
    sendError(res, error, 'Error fetching bookings');
  }
});

// Get session requests pending for teacher (to accept/reject)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const requests = await prisma.booking.findMany({
      where: { teacherId: req.user.id, status: 'Requested' },
      include: {
        learner: { select: { id: true, name: true, email: true, college: true, yearOfStudy: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    sendError(res, error, 'Error fetching requests');
  }
});

// Get my requests (requests I sent to teachers)
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await prisma.booking.findMany({
      where: { learnerId: req.user.id, status: 'Requested' },
      include: {
        teacher: { select: { id: true, name: true, email: true, college: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    sendError(res, error, 'Error fetching my requests');
  }
});

// Get upcoming sessions
router.get('/upcoming', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const sessions = await prisma.booking.findMany({
      where: {
        OR: [{ teacherId: userId }, { learnerId: userId }],
        status: 'Confirmed',
        dateTime: { gte: new Date() }
      },
      include: participants,
      orderBy: { dateTime: 'asc' }
    });

    res.json(sessions);
  } catch (error) {
    sendError(res, error, 'Error fetching upcoming sessions');
  }
});

// Get completed sessions
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const sessions = await prisma.booking.findMany({
      where: {
        OR: [{ teacherId: userId }, { learnerId: userId }],
        status: 'Completed'
      },
      include: participants,
      orderBy: { dateTime: 'desc' }
    });

    res.json(sessions);
  } catch (error) {
    sendError(res, error, 'Error fetching completed sessions');
  }
});

// Create a new booking request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const { teacherId, skill, skillId, dateTime, duration, notes, creditsPerHour } = req.body;

    // Validate required fields
    if (!teacherId || !skill || !dateTime || !creditsPerHour) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const when = new Date(dateTime);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Invalid dateTime' });
    }
    if (when.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Sessions must be scheduled in the future' });
    }

    const hours = Number(duration || 1);
    if (!Number.isInteger(hours) || hours < 1) {
      return res.status(400).json({ error: 'Duration must be a whole number of hours' });
    }

    // Don't allow booking yourself
    if (teacherId === learnerId) {
      return res.status(400).json({ error: 'Cannot request a session with yourself' });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const teacher = await tx.user.findUnique({ where: { id: teacherId } });
      if (!teacher) {
        throw new HttpError(404, 'Teacher not found. These are demo teachers that cannot receive session requests.');
      }

      // The price comes from the teacher's own skill row, never from the
      // request body — otherwise a learner could name their own rate.
      const offered = await tx.skill.findFirst({
        where: skillId ? { id: skillId, userId: teacherId } : { userId: teacherId, skillName: skill }
      });
      if (!offered) {
        throw new HttpError(400, 'That teacher does not offer this skill');
      }

      const creditAmount = offered.creditsPerHour * hours;

      // Debit and balance check in one statement: a concurrent request cannot
      // slip between reading the balance and writing it.
      const debited = await tx.user.updateMany({
        where: { id: learnerId, creditBalance: { gte: creditAmount } },
        data: { creditBalance: { decrement: creditAmount } }
      });
      if (debited.count === 0) {
        throw new HttpError(400, 'Insufficient credits');
      }

      const created = await tx.booking.create({
        data: {
          teacherId,
          learnerId,
          skill,
          skillId: offered ? offered.id : null,
          creditAmount,
          dateTime: when,
          duration: hours,
          notes,
          status: 'Requested'
        },
        include: participants
      });

      await tx.transaction.create({
        data: {
          userId: learnerId,
          type: 'Lock',
          amount: -creditAmount,
          bookingId: created.id,
          description: `Locked ${creditAmount} credits for session request`
        }
      });

      return created;
    });

    res.status(201).json(booking);
  } catch (error) {
    sendError(res, error, 'Error creating booking request');
  }
});

// Accept a session request
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (booking.status !== 'Requested') {
      return res.status(400).json({ error: 'Booking cannot be accepted' });
    }

    const accepted = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'Requested' },
      data: { status: 'Confirmed' }
    });
    if (accepted.count === 0) {
      return res.status(400).json({ error: 'Booking cannot be accepted' });
    }

    res.json(await prisma.booking.findUnique({ where: { id: booking.id }, include: participants }));
  } catch (error) {
    sendError(res, error, 'Error accepting booking');
  }
});

// Refund the learner and cancel, as one atomic step. The conditional update is
// what stops a double refund: only the first caller flips the status.
const cancelWithRefund = async (bookingId, cancelledBy, description) => {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });

    const cancelled = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: ['Requested', 'Confirmed'] } },
      data: { status: 'Cancelled', cancelledBy }
    });
    if (cancelled.count === 0) {
      throw new HttpError(400, 'Booking cannot be cancelled');
    }

    await tx.user.update({
      where: { id: booking.learnerId },
      data: { creditBalance: { increment: booking.creditAmount } }
    });

    await tx.transaction.create({
      data: {
        userId: booking.learnerId,
        type: 'Refund',
        amount: booking.creditAmount,
        bookingId: booking.id,
        description
      }
    });

    return tx.booking.findUnique({ where: { id: bookingId }, include: participants });
  });
};

// Reject a session request
router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (booking.status !== 'Requested') {
      return res.status(400).json({ error: 'Booking cannot be rejected' });
    }

    res.json(await cancelWithRefund(
      booking.id,
      'teacher',
      'Credits refunded after session request rejection'
    ));
  } catch (error) {
    sendError(res, error, 'Error rejecting booking');
  }
});

// Cancel a booking (by learner)
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.learnerId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (booking.status === 'Completed') {
      return res.status(400).json({ error: 'Cannot cancel completed session' });
    }
    // The mongoose version only blocked Completed, so cancelling an already
    // cancelled booking refunded the learner a second time.
    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    res.json(await cancelWithRefund(
      booking.id,
      'learner',
      'Credits refunded after booking cancellation'
    ));
  } catch (error) {
    sendError(res, error, 'Error cancelling booking');
  }
});

// Complete a session (dual confirmation)
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { completedBy } = req.body; // 'learner' or 'teacher'

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: req.params.id } });
      if (!booking) {
        throw new HttpError(404, 'Booking not found');
      }
      if (booking.status !== 'Confirmed') {
        throw new HttpError(400, 'Only confirmed sessions can be completed');
      }

      // Mark completion by the appropriate party
      if (completedBy === 'learner' && booking.learnerId === req.user.id) {
        await tx.booking.update({ where: { id: booking.id }, data: { completedByLearner: true } });
      } else if (completedBy === 'teacher' && booking.teacherId === req.user.id) {
        await tx.booking.update({ where: { id: booking.id }, data: { completedByTeacher: true } });
      } else {
        throw new HttpError(403, 'Unauthorized');
      }

      // Only the update that actually flips Confirmed -> Completed pays the
      // teacher, so two simultaneous confirmations cannot pay twice.
      const finished = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: 'Confirmed',
          completedByLearner: true,
          completedByTeacher: true
        },
        data: { status: 'Completed' }
      });

      if (finished.count === 1) {
        // The learner was already debited when the request was made.
        await tx.user.update({
          where: { id: booking.teacherId },
          data: { creditBalance: { increment: booking.creditAmount } }
        });

        await tx.transaction.createMany({
          data: [
            {
              userId: booking.learnerId,
              type: 'Transfer',
              amount: -booking.creditAmount,
              bookingId: booking.id,
              description: `Paid ${booking.creditAmount} credits for ${booking.skill} session`
            },
            {
              userId: booking.teacherId,
              type: 'Transfer',
              amount: booking.creditAmount,
              bookingId: booking.id,
              description: `Earned ${booking.creditAmount} credits from ${booking.skill} session`
            }
          ]
        });
      }

      return tx.booking.findUnique({ where: { id: booking.id }, include: participants });
    });

    res.json(result);
  } catch (error) {
    sendError(res, error, 'Error completing session');
  }
});

// Reset everything for a user - cancel all pending bookings and restore credits
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const myRequests = await tx.booking.findMany({
        where: { learnerId: userId, status: 'Requested' }
      });

      const totalRefunded = myRequests.reduce((sum, b) => sum + b.creditAmount, 0);

      if (myRequests.length > 0) {
        await tx.booking.updateMany({
          where: { id: { in: myRequests.map((b) => b.id) } },
          data: { status: 'Cancelled', cancelledBy: 'learner' }
        });

        await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: totalRefunded } }
        });

        await tx.transaction.createMany({
          data: myRequests.map((b) => ({
            userId,
            type: 'Refund',
            amount: b.creditAmount,
            bookingId: b.id,
            description: 'Credits refunded during reset'
          }))
        });
      }

      return { totalRefunded, cancelledBookings: myRequests.map((b) => b.id) };
    });

    res.json({
      message: 'Reset successful',
      creditsRestored: result.totalRefunded,
      bookingsCancelled: result.cancelledBookings.length,
      cancelledBookingIds: result.cancelledBookings
    });
  } catch (error) {
    sendError(res, error, 'Error resetting bookings');
  }
});

module.exports = router;
