const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { HttpError, sendError } = require('../lib/httpError');
const { cancelWithRefund } = require('../lib/bookingCancel');

// Everything below is admin-only. `auth` puts the role on the request by
// re-reading the user, so a demoted admin loses access immediately.
router.use(auth, requireAdmin);

const MAX_ADJUSTMENT = 1000;

// Columns safe to return. Never `select: undefined` here — User carries a
// password hash.
const adminUserFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  college: true,
  yearOfStudy: true,
  creditBalance: true,
  rating: true,
  reviewCount: true,
  createdAt: true
};

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

// --- Users ---------------------------------------------------------------

// Filtered and paged in the database, matching /users/teachers/search.
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const query = (req.query.query || '').trim();

    const where = query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } }
          ]
        }
      : {};

    const [results, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: adminUserFields,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    res.json({ results, total, page, hasMore: page * limit < total });
  } catch (error) {
    sendError(res, error, 'Error listing users');
  }
});

// Suspend or reinstate an account.
router.patch('/users/:id/status', [
  check('status', 'Status must be active or suspended').isIn(['active', 'suspended'])
], async (req, res) => {
  if (!validate(req, res)) return;

  // Suspending yourself locks you out of the panel you are standing in.
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own account status' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
      select: adminUserFields
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    sendError(res, error, 'Error updating user status');
  }
});

// Promote to admin or demote back. This is the only way to mint an admin
// through the API; the first one is seeded with make-admin.js.
router.patch('/users/:id/role', [
  check('role', 'Role must be user or admin').isIn(['user', 'admin'])
], async (req, res) => {
  if (!validate(req, res)) return;

  // Demoting yourself could leave the app with no admin at all.
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: req.body.role },
      select: adminUserFields
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    sendError(res, error, 'Error updating user role');
  }
});

// Delete an account outright. Bookings deliberately restrict this: removing
// someone who has sessions would strand the other party's history and their
// credits. Suspend those instead.
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const bookings = await prisma.booking.count({
      where: { OR: [{ teacherId: req.params.id }, { learnerId: req.params.id }] }
    });
    if (bookings > 0) {
      return res.status(409).json({
        error: `That account has ${bookings} booking(s) and cannot be deleted. Suspend it instead.`
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Account deleted' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    sendError(res, error, 'Error deleting user');
  }
});

// Grant or deduct credits by hand. Written as a Transaction row so the ledger
// still explains every balance.
router.post('/users/:id/credits', [
  check('amount', `Amount must be a non-zero whole number within ±${MAX_ADJUSTMENT}`)
    .isInt({ min: -MAX_ADJUSTMENT, max: MAX_ADJUSTMENT }),
  check('reason', 'A reason is required').trim().notEmpty()
], async (req, res) => {
  if (!validate(req, res)) return;

  const amount = Number(req.body.amount);
  if (amount === 0) {
    return res.status(400).json({ error: 'Amount must not be zero' });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Deducting must not push anyone negative, and the guard has to be part
      // of the same statement as the write — the booking debit does the same.
      const changed = await tx.user.updateMany({
        where:
          amount < 0
            ? { id: req.params.id, creditBalance: { gte: -amount } }
            : { id: req.params.id },
        data: { creditBalance: { increment: amount } }
      });

      if (changed.count === 0) {
        const exists = await tx.user.findUnique({ where: { id: req.params.id } });
        throw new HttpError(exists ? 400 : 404,
          exists ? 'That would take the balance below zero' : 'User not found');
      }

      await tx.transaction.create({
        data: {
          userId: req.params.id,
          type: 'Adjustment',
          amount,
          description: `Admin adjustment by ${req.user.email}: ${req.body.reason.trim()}`
        }
      });

      return tx.user.findUnique({ where: { id: req.params.id }, select: adminUserFields });
    });

    res.json(user);
  } catch (error) {
    sendError(res, error, 'Error adjusting credits');
  }
});

// --- Content -------------------------------------------------------------

// Remove a review and recompute the subject's rating from what is left.
router.delete('/reviews/:id', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id: req.params.id } });
      if (!review) {
        throw new HttpError(404, 'Review not found');
      }

      await tx.review.delete({ where: { id: review.id } });

      // The review_rating_sync trigger has already corrected the reviewee's
      // rating and reviewCount by this point; read back what it wrote.
      const reviewee = await tx.user.findUnique({
        where: { id: review.revieweeId },
        select: { rating: true, reviewCount: true }
      });

      return {
        revieweeId: review.revieweeId,
        rating: reviewee.rating,
        reviewCount: reviewee.reviewCount
      };
    });

    res.json({ message: 'Review deleted', ...result });
  } catch (error) {
    sendError(res, error, 'Error deleting review');
  }
});

// Remove a skill listing. Bookings keep their own copy of the skill name and
// the foreign key is SetNull, so past sessions survive the delete.
router.delete('/skills/:id', async (req, res) => {
  try {
    await prisma.skill.delete({ where: { id: req.params.id } });
    res.json({ message: 'Skill listing removed' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Skill not found' });
    sendError(res, error, 'Error deleting skill');
  }
});

// Cancel someone else's booking, refunding the learner. Reuses the same helper
// as the learner's cancel and the teacher's reject, so credits move identically.
router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(await cancelWithRefund(
      booking.id,
      'admin',
      `Cancelled by administrator ${req.user.email}`
    ));
  } catch (error) {
    sendError(res, error, 'Error cancelling booking');
  }
});

module.exports = router;
