// Smoke test for the Prisma-backed booking routes, focused on credit movement.
// Run with the server up: node smoke-bookings.js
const assert = require('assert');
const { call, newUser, finish, fail } = require('./smoke-helpers');

const credits = async (token) => (await call('GET', '/profile', { token })).body.creditBalance;

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

const teach = async (token, skillName, creditsPerHour) => {
  const res = await call('POST', '/profile/skills/teach', {
    token,
    body: { skillName, level: 'Expert', creditsPerHour, description: 'desc' }
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body[0].id;
};

const request = (learner, teacherId, skill, extra = {}) =>
  call('POST', '/bookings', {
    token: learner.token,
    body: { teacherId, skill, dateTime: tomorrow(), duration: 2, creditsPerHour: 2, ...extra }
  });

(async () => {
  // --- happy path: request -> accept -> both complete -> credits transfer ---
  const teacher = await newUser('teacher');
  const learner = await newUser('learner');
  await teach(teacher.token, 'Guitar', 2);

  assert.strictEqual(await credits(learner.token), 10);
  const booked = await request(learner, teacher.id, 'Guitar');
  assert.strictEqual(booked.status, 201, JSON.stringify(booked.body));
  assert.strictEqual(booked.body.creditAmount, 4, '2 credits/hr x 2 hours should be 4');
  assert.strictEqual(booked.body.status, 'Requested');
  assert.strictEqual(booked.body.teacher.name, 'Smoke teacher', 'teacher was not populated');
  assert.strictEqual(await credits(learner.token), 6, 'credits were not locked at request time');
  assert.strictEqual(await credits(teacher.token), 10, 'teacher was paid before completion');

  const id = booked.body.id;

  // Only the teacher may accept.
  assert.strictEqual((await call('POST', `/bookings/${id}/accept`, { token: learner.token })).status, 403);
  assert.strictEqual((await call('POST', `/bookings/${id}/accept`, { token: teacher.token })).status, 200);
  assert.strictEqual((await call('POST', `/bookings/${id}/accept`, { token: teacher.token })).status, 400,
    'a confirmed booking was accepted twice');

  // Dual confirmation: one side alone must not pay out.
  await call('POST', `/bookings/${id}/complete`, { token: learner.token, body: { completedBy: 'learner' } });
  assert.strictEqual(await credits(teacher.token), 10, 'teacher was paid on a single confirmation');
  const done = await call('POST', `/bookings/${id}/complete`, { token: teacher.token, body: { completedBy: 'teacher' } });
  assert.strictEqual(done.body.status, 'Completed');
  assert.strictEqual(await credits(teacher.token), 14, 'teacher was not paid on dual confirmation');
  assert.strictEqual(await credits(learner.token), 6, 'learner was charged twice');

  // A completed session cannot be cancelled or re-completed.
  assert.strictEqual((await call('POST', `/bookings/${id}/cancel`, { token: learner.token })).status, 400);
  assert.strictEqual((await call('POST', `/bookings/${id}/complete`, { token: teacher.token, body: { completedBy: 'teacher' } })).status, 400);
  assert.strictEqual(await credits(teacher.token), 14, 'teacher was paid twice');

  // --- cancelling refunds exactly once ---
  const l2 = await newUser('cancel');
  const b2 = await request(l2, teacher.id, 'Guitar');
  assert.strictEqual(await credits(l2.token), 6);
  assert.strictEqual((await call('POST', `/bookings/${b2.body.id}/cancel`, { token: l2.token })).status, 200);
  assert.strictEqual(await credits(l2.token), 10, 'cancelling did not refund');
  const again = await call('POST', `/bookings/${b2.body.id}/cancel`, { token: l2.token });
  assert.strictEqual(again.status, 400, 'an already-cancelled booking was cancelled again');
  assert.strictEqual(await credits(l2.token), 10, 'cancelling twice refunded twice');

  // --- a confirmed session neither side has completed can still be cancelled ---
  const l6 = await newUser('confirmed-cancel');
  const b6 = await request(l6, teacher.id, 'Guitar');
  assert.strictEqual((await call('POST', `/bookings/${b6.body.id}/accept`, { token: teacher.token })).status, 200);
  assert.strictEqual(await credits(l6.token), 6);
  assert.strictEqual((await call('POST', `/bookings/${b6.body.id}/cancel`, { token: l6.token })).status, 200,
    'a confirmed, not-yet-completed session could not be cancelled');
  assert.strictEqual(await credits(l6.token), 10, 'cancelling a confirmed session did not refund');

  // --- once either side marks complete, cancelling is blocked ---
  const l7 = await newUser('half-complete');
  const b7 = await request(l7, teacher.id, 'Guitar');
  assert.strictEqual((await call('POST', `/bookings/${b7.body.id}/accept`, { token: teacher.token })).status, 200);
  assert.strictEqual((await call('POST', `/bookings/${b7.body.id}/complete`, { token: l7.token, body: { completedBy: 'learner' } })).status, 200);
  assert.strictEqual(await credits(l7.token), 6, 'marking complete alone should not refund or pay out');
  const blockedCancel = await call('POST', `/bookings/${b7.body.id}/cancel`, { token: l7.token });
  assert.strictEqual(blockedCancel.status, 400, 'a session already marked complete by one side was still cancellable');
  assert.strictEqual(await credits(l7.token), 6, 'a blocked cancel still refunded credits');
  const stillConfirmed = await call('GET', '/bookings', { token: l7.token });
  assert.strictEqual(stillConfirmed.body.find((b) => b.id === b7.body.id).status, 'Confirmed',
    'the booking status changed despite the cancel being blocked');

  // --- rejecting refunds exactly once ---
  const l3 = await newUser('reject');
  const b3 = await request(l3, teacher.id, 'Guitar');
  assert.strictEqual((await call('POST', `/bookings/${b3.body.id}/reject`, { token: teacher.token })).status, 200);
  assert.strictEqual(await credits(l3.token), 10, 'rejecting did not refund');
  assert.strictEqual((await call('POST', `/bookings/${b3.body.id}/reject`, { token: teacher.token })).status, 400);
  assert.strictEqual(await credits(l3.token), 10, 'rejecting twice refunded twice');

  // --- the client-supplied price is ignored entirely ---
  const l4 = await newUser('cheapskate');
  const underpaid = await request(l4, teacher.id, 'Guitar', { creditsPerHour: 1 });
  assert.strictEqual(underpaid.body.creditAmount, 4, 'the client set its own price');
  // A skill the teacher does not offer cannot be booked at any price.
  const notOffered = await request(l4, teacher.id, 'Underwater Basket Weaving');
  assert.strictEqual(notOffered.status, 400, 'booked a skill the teacher does not teach');

  // --- sessions must be in the future ---
  const past = await call('POST', '/bookings', {
    token: l4.token,
    body: { teacherId: teacher.id, skill: 'Guitar', dateTime: new Date(Date.now() - 86400000).toISOString(), duration: 1, creditsPerHour: 2 }
  });
  assert.strictEqual(past.status, 400, 'a session was booked in the past');

  // --- guards ---
  const broke = await newUser('broke');
  assert.strictEqual((await request(broke, teacher.id, 'Guitar', { duration: 6 })).status, 400,
    'a booking beyond the credit balance was allowed');
  assert.strictEqual(await credits(broke.token), 10, 'a failed booking still moved credits');
  assert.strictEqual((await request(teacher, teacher.id, 'Guitar')).status, 400, 'self-booking was allowed');
  assert.strictEqual((await request(broke, 'no-such-user', 'Guitar')).status, 404);
  assert.strictEqual((await call('GET', '/bookings')).status, 401, 'bookings are readable without a token');

  // --- reset refunds every pending request at once ---
  const l5 = await newUser('reset');
  await request(l5, teacher.id, 'Guitar');
  assert.strictEqual(await credits(l5.token), 6);
  const reset = await call('POST', '/bookings/reset', { token: l5.token });
  assert.strictEqual(reset.body.creditsRestored, 4);
  assert.strictEqual(reset.body.bookingsCancelled, 1);
  assert.strictEqual(await credits(l5.token), 10, 'reset did not restore credits');

  // --- listings ---
  const mine = await call('GET', '/bookings', { token: learner.token });
  assert.ok(mine.body.some((b) => b.id === id), 'the booking is missing from GET /bookings');
  const completed = await call('GET', '/bookings/completed', { token: teacher.token });
  assert.ok(completed.body.some((b) => b.id === id), 'the completed session is missing');
  assert.strictEqual((await call('GET', '/bookings/cleanup-orphaned', { token: learner.token })).status, 404,
    'the retired cleanup endpoint still exists');
  await finish('bookings');
})().catch(fail);
