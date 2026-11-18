const prisma = require('./prisma');
const { HttpError } = require('./httpError');

// Matches the old `.populate('teacher', 'name email')` shape.
const participants = {
  teacher: { select: { id: true, name: true, email: true } },
  learner: { select: { id: true, name: true, email: true } }
};

// Refund the learner and cancel, as one atomic step. The conditional update is
// what stops a double refund: only the first caller flips the status.
//
// Shared by the learner's cancel, the teacher's reject, and an admin cancel —
// all three must move credits identically, so there is one copy of it.
const cancelWithRefund = async (bookingId, cancelledBy, description) => {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });

    const cancelled = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: { in: ['Requested', 'Confirmed'] },
        // Once either side has marked the session complete, cancelling would
        // refund the learner while denying the teacher a payout they may
        // already be owed. A Requested booking can never have either flag
        // set (completion requires status Confirmed), so this is a no-op
        // for the reject path and only actually guards cancel.
        completedByLearner: false,
        completedByTeacher: false
      },
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

module.exports = { cancelWithRefund, participants };
