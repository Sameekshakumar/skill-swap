const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authenticateToken } = require('../middleware/auth');

// Get all bookings for the authenticated user (as teacher or learner)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get bookings where user is teacher or learner
    const bookings = await Booking.find({
      $or: [{ teacher: userId }, { learner: userId }]
    })
    .populate('teacher', 'name email')
    .populate('learner', 'name email')
    .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching bookings' });
  }
});

// Get session requests pending for teacher (to accept/reject)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const requests = await Booking.find({
      teacher: userId,
      status: 'Requested'
    })
    .populate('learner', 'name email college yearOfStudy')
    .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching requests' });
  }
});

// Get my requests (requests I sent to teachers)
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const requests = await Booking.find({
      learner: userId,
      status: 'Requested'
    })
    .populate('teacher', 'name email college')
    .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching my requests' });
  }
});

// Create a new booking request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const learnerId = req.user._id;
    const { teacherId, skill, skillId, dateTime, duration, notes, creditsPerHour } = req.body;

    // Validate required fields
    if (!teacherId || !skill || !dateTime || !creditsPerHour) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // First, check if teacher exists
    const teacher = await User.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found. These are demo teachers that cannot receive session requests.' });
    }

    // Check if learner has enough credits
    const learner = await User.findById(learnerId);
    if (!learner) {
      return res.status(404).json({ error: 'Learner not found' });
    }
    
    const creditAmount = creditsPerHour * (duration || 1);
    
    if (learner.creditBalance < creditAmount) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    // Don't allow booking yourself
    if (teacherId.toString() === learnerId.toString()) {
      return res.status(400).json({ error: 'Cannot request a session with yourself' });
    }

    // NOW lock the credits (after all validations pass)
    learner.creditBalance -= creditAmount;
    await learner.save();

    // Create transaction record for credit lock
    await Transaction.create({
      user: learnerId,
      type: 'Lock',
      amount: -creditAmount,
      description: `Locked ${creditAmount} credits for session request`
    });

    // Create the booking request
    const booking = new Booking({
      teacher: teacherId,
      learner: learnerId,
      skill,
      skillId,
      creditAmount,
      dateTime: new Date(dateTime),
      duration: duration || 1,
      notes,
      status: 'Requested'
    });

    await booking.save();
    
    // Populate and return the booking
    await booking.populate(['teacher', 'learner']);
    res.status(201).json(booking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: error.message || 'Error creating booking request' });
  }
});

// Accept a session request
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('teacher')
      .populate('learner');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify that the authenticated user is the teacher
    if (booking.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'Requested') {
      return res.status(400).json({ error: 'Booking cannot be accepted' });
    }

    booking.status = 'Confirmed';
    await booking.save();

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Error accepting booking' });
  }
});

// Reject a session request
router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('teacher')
      .populate('learner');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify that the authenticated user is the teacher
    if (booking.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'Requested') {
      return res.status(400).json({ error: 'Booking cannot be rejected' });
    }

    // Refund credits to learner
    const learner = await User.findById(booking.learner._id);
    learner.creditBalance += booking.creditAmount;
    await learner.save();

    // Create transaction record for credit refund
    await Transaction.create({
      user: booking.learner._id,
      type: 'Refund',
      amount: booking.creditAmount,
      booking: booking._id,
      description: 'Credits refunded after session request rejection'
    });

    booking.status = 'Cancelled';
    booking.cancelledBy = 'teacher';
    await booking.save();

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Error rejecting booking' });
  }
});

// Cancel a booking (by learner)
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('teacher')
      .populate('learner');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify that the authenticated user is the learner
    if (booking.learner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status === 'Completed') {
      return res.status(400).json({ error: 'Cannot cancel completed session' });
    }

    // Refund credits to learner
    const learner = await User.findById(booking.learner._id);
    learner.creditBalance += booking.creditAmount;
    await learner.save();

    // Create transaction record
    await Transaction.create({
      user: booking.learner._id,
      type: 'Refund',
      amount: booking.creditAmount,
      booking: booking._id,
      description: 'Credits refunded after booking cancellation'
    });

    booking.status = 'Cancelled';
    booking.cancelledBy = 'learner';
    await booking.save();

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Error cancelling booking' });
  }
});

// Complete a session (dual confirmation)
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { completedBy } = req.body; // 'learner' or 'teacher'
    const booking = await Booking.findById(req.params.id)
      .populate('teacher')
      .populate('learner');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'Confirmed') {
      return res.status(400).json({ error: 'Only confirmed sessions can be completed' });
    }

    // Mark completion by the appropriate party
    if (completedBy === 'learner' && booking.learner._id.toString() === req.user._id.toString()) {
      booking.completedByLearner = true;
    } else if (completedBy === 'teacher' && booking.teacher._id.toString() === req.user._id.toString()) {
      booking.completedByTeacher = true;
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // If both have confirmed, complete the session and transfer credits
    if (booking.completedByLearner && booking.completedByTeacher) {
      booking.status = 'Completed';

      // Transfer credits from learner to teacher
      const teacher = await User.findById(booking.teacher._id);
      teacher.creditBalance += booking.creditAmount;
      await teacher.save();

      // Create transaction records
      await Transaction.create({
        user: booking.learner._id,
        type: 'Transfer',
        amount: -booking.creditAmount,
        booking: booking._id,
        description: `Paid ${booking.creditAmount} credits for ${booking.skill} session`
      });

      await Transaction.create({
        user: booking.teacher._id,
        type: 'Transfer',
        amount: booking.creditAmount,
        booking: booking._id,
        description: `Earned ${booking.creditAmount} credits from ${booking.skill} session`
      });
    }

    await booking.save();
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Error completing session' });
  }
});

// Get upcoming sessions
router.get('/upcoming', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const sessions = await Booking.find({
      $or: [{ teacher: userId }, { learner: userId }],
      status: 'Confirmed',
      dateTime: { $gte: new Date() }
    })
    .populate('teacher', 'name email')
    .populate('learner', 'name email')
    .sort({ dateTime: 1 });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching upcoming sessions' });
  }
});

// Get completed sessions
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const sessions = await Booking.find({
      $or: [{ teacher: userId }, { learner: userId }],
      status: 'Completed'
    })
    .populate('teacher', 'name email')
    .populate('learner', 'name email')
    .sort({ dateTime: -1 });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching completed sessions' });
  }
});

// Find and clean up orphaned bookings (where teacher doesn't exist)
// This should only be called if there were failed bookings due to invalid teacher IDs
router.get('/cleanup-orphaned', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find bookings where learner is current user and status is Requested
    const bookings = await Booking.find({
      learner: userId,
      status: 'Requested'
    }).populate('teacher');

    let creditsRefunded = 0;
    const refundedBookings = [];

    for (const booking of bookings) {
      // If teacher doesn't exist (null or deleted), refund the credits
      if (!booking.teacher) {
        const learner = await User.findById(userId);
        learner.creditBalance += booking.creditAmount;
        await learner.save();

        // Record the transaction
        await Transaction.create({
          user: userId,
          type: 'Refund',
          amount: booking.creditAmount,
          booking: booking._id,
          description: 'Credits refunded for invalid booking'
        });

        // Delete the orphaned booking
        await Booking.findByIdAndDelete(booking._id);
        
        creditsRefunded += booking.creditAmount;
        refundedBookings.push(booking._id);
      }
    }

    res.json({
      message: `Found and cleaned up ${refundedBookings.length} orphaned bookings`,
      creditsRefunded,
      refundedBookingIds: refundedBookings
    });
  } catch (error) {
    console.error('Error cleaning up orphaned bookings:', error);
    res.status(500).json({ error: 'Error cleaning up orphaned bookings' });
  }
});

// Reset everything for a user - cancel all pending bookings and restore credits
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all bookings where user is learner and status is Requested
    const myRequests = await Booking.find({
      learner: userId,
      status: 'Requested'
    });
    
    let totalRefunded = 0;
    const cancelledBookings = [];
    
    for (const booking of myRequests) {
      // Refund credits
      const learner = await User.findById(userId);
      learner.creditBalance += booking.creditAmount;
      await learner.save();
      
      // Record transaction
      await Transaction.create({
        user: userId,
        type: 'Refund',
        amount: booking.creditAmount,
        booking: booking._id,
        description: 'Credits refunded during reset'
      });
      
      // Cancel booking
      booking.status = 'Cancelled';
      booking.cancelledBy = 'learner';
      await booking.save();
      
      totalRefunded += booking.creditAmount;
      cancelledBookings.push(booking._id);
    }
    
    res.json({
      message: 'Reset successful',
      creditsRestored: totalRefunded,
      bookingsCancelled: cancelledBookings.length,
      cancelledBookingIds: cancelledBookings
    });
  } catch (error) {
    console.error('Error resetting bookings:', error);
    res.status(500).json({ error: 'Error resetting bookings' });
  }
});

module.exports = router;
