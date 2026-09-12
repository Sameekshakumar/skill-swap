// Smoke test for the Prisma-backed review routes, focused on the rating aggregate.
// Run with the server up: node smoke-reviews.js
const assert = require('assert');

const BASE = `http://localhost:${process.env.PORT || 5001}/api`;

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

const newUser = async (tag) => {
  const res = await call('POST', '/auth/register', {
    body: { name: `Smoke ${tag}`, email: `smoke-${tag}-${Date.now()}-${Math.random()}@example.com`, password: 'secret123' }
  });
  assert.strictEqual(res.status, 201, `register ${tag}: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id };
};

const rating = async (id, token) => (await call('GET', `/users/${id}`, { token })).body;

// Drive a booking all the way to Completed so it becomes reviewable.
const completedBooking = async (teacher, learner) => {
  const skill = `Skill${Date.now()}${Math.random()}`.replace('.', '');
  await call('POST', '/profile/skills/teach', {
    token: teacher.token,
    body: { skillName: skill, level: 'Expert', creditsPerHour: 1, description: 'desc' }
  });
  const booked = await call('POST', '/bookings', {
    token: learner.token,
    body: { teacherId: teacher.id, skill, dateTime: new Date(Date.now() + 86400000).toISOString(), duration: 1, creditsPerHour: 1 }
  });
  assert.strictEqual(booked.status, 201, JSON.stringify(booked.body));
  const id = booked.body.id;
  await call('POST', `/bookings/${id}/accept`, { token: teacher.token });
  await call('POST', `/bookings/${id}/complete`, { token: learner.token, body: { completedBy: 'learner' } });
  await call('POST', `/bookings/${id}/complete`, { token: teacher.token, body: { completedBy: 'teacher' } });
  return { id, skill };
};

(async () => {
  const teacher = await newUser('rev-teacher');
  const learner = await newUser('rev-learner');
  const stranger = await newUser('rev-stranger');

  const { id: bookingId, skill } = await completedBooking(teacher, learner);

  // /pending lists the completed booking for both sides.
  const pending = await call('GET', '/reviews/pending', { token: learner.token });
  assert.strictEqual(pending.status, 200, JSON.stringify(pending.body));
  const entry = pending.body.find((p) => p.bookingId === bookingId);
  assert.ok(entry, 'the completed booking is missing from /pending');
  assert.strictEqual(entry.revieweeId, teacher.id);
  assert.strictEqual(entry.revieweeName, 'Smoke rev-teacher');
  assert.strictEqual(entry.skill, skill);

  // Validation.
  assert.strictEqual((await call('POST', '/reviews', { token: learner.token, body: { bookingId, rating: 6 } })).status, 400);
  assert.strictEqual((await call('POST', '/reviews', { token: learner.token, body: { bookingId, rating: 0 } })).status, 400);
  assert.strictEqual((await call('POST', '/reviews', { token: learner.token, body: { bookingId, rating: 4, comment: 'x'.repeat(501) } })).status, 400);
  assert.strictEqual((await call('POST', '/reviews', { token: stranger.token, body: { bookingId, rating: 5 } })).status, 403,
    'a non-participant reviewed the booking');
  assert.strictEqual((await call('POST', '/reviews', { token: learner.token, body: { bookingId: 'nope', rating: 5 } })).status, 404);

  // A booking that is not Completed cannot be reviewed.
  const open = await call('POST', '/bookings', {
    token: learner.token,
    body: { teacherId: teacher.id, skill, dateTime: new Date(Date.now() + 86400000).toISOString(), duration: 1, creditsPerHour: 1 }
  });
  const tooEarly = await call('POST', '/reviews', { token: learner.token, body: { bookingId: open.body.id, rating: 1 } });
  assert.strictEqual(tooEarly.status, 400, 'an open booking was reviewable');

  // First review: the aggregate lands on the teacher.
  const first = await call('POST', '/reviews', { token: learner.token, body: { bookingId, rating: 4, comment: ' Great ' } });
  assert.strictEqual(first.status, 201, JSON.stringify(first.body));
  assert.strictEqual(first.body.review.skill, skill, 'the skill was not copied off the booking');
  assert.strictEqual(first.body.review.comment, 'Great', 'the comment was not trimmed');
  let t = await rating(teacher.id, learner.token);
  assert.strictEqual(t.rating, 4, 'rating did not update');
  assert.strictEqual(t.reviewCount, 1, 'reviewCount did not update');

  // The same reviewer cannot review the same booking twice.
  const dupe = await call('POST', '/reviews', { token: learner.token, body: { bookingId, rating: 1 } });
  assert.strictEqual(dupe.status, 400, 'a duplicate review was accepted');
  t = await rating(teacher.id, learner.token);
  assert.strictEqual(t.reviewCount, 1, 'a rejected duplicate still moved the aggregate');

  // The teacher reviews the learner off the same booking — separate direction.
  const back = await call('POST', '/reviews', { token: teacher.token, body: { bookingId, rating: 5 } });
  assert.strictEqual(back.status, 201, JSON.stringify(back.body));
  const l = await rating(learner.id, teacher.token);
  assert.strictEqual(l.rating, 5);
  assert.strictEqual(l.reviewCount, 1);

  // A second review of the teacher averages, and rounds to one decimal.
  const learner2 = await newUser('rev-learner2');
  const second = await completedBooking(teacher, learner2);
  await call('POST', '/reviews', { token: learner2.token, body: { bookingId: second.id, rating: 5 } });
  t = await rating(teacher.id, learner.token);
  assert.strictEqual(t.reviewCount, 2);
  assert.strictEqual(t.rating, 4.5, `average of 4 and 5 should be 4.5, got ${t.rating}`);

  const learner3 = await newUser('rev-learner3');
  const third = await completedBooking(teacher, learner3);
  await call('POST', '/reviews', { token: learner3.token, body: { bookingId: third.id, rating: 5 } });
  t = await rating(teacher.id, learner.token);
  assert.strictEqual(t.reviewCount, 3);
  assert.strictEqual(t.rating, 4.7, `average of 4,5,5 should round to 4.7, got ${t.rating}`);

  // Listings.
  const forTeacher = await call('GET', `/reviews/user/${teacher.id}`);
  assert.strictEqual(forTeacher.status, 200, 'reviews for a user should be public');
  assert.strictEqual(forTeacher.body.length, 3);
  assert.strictEqual(forTeacher.body[0].reviewer.name, 'Smoke rev-learner3', 'reviewer was not populated / wrong order');

  const received = await call('GET', '/reviews/received', { token: teacher.token });
  assert.strictEqual(received.body.length, 3);
  const given = await call('GET', '/reviews/my-reviews', { token: learner.token });
  assert.strictEqual(given.body.length, 1);
  assert.strictEqual(given.body[0].reviewee.id, teacher.id);
  assert.ok(given.body[0].booking, 'the booking was not populated');

  // The reviewed booking drops off /pending.
  const after = await call('GET', '/reviews/pending', { token: learner.token });
  assert.ok(!after.body.some((p) => p.bookingId === bookingId), 'a reviewed booking is still pending');

  console.log('reviews smoke test passed');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
