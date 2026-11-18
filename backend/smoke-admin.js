// Smoke test for RBAC and the admin routes.
// Run with the server up: node smoke-admin.js
const assert = require('assert');
const { call, newUser, finish, fail, prisma } = require('./smoke-helpers');

(async () => {
  const admin = await newUser('admin', { role: 'admin' });
  const plain = await newUser('plain');

  assert.strictEqual(admin.role, 'admin', 'the admin fixture is not an admin');

  // --- the boundary itself ---
  const guarded = [
    ['GET', '/admin/users'],
    ['PATCH', `/admin/users/${plain.id}/status`],
    ['PATCH', `/admin/users/${plain.id}/role`],
    ['DELETE', `/admin/users/${plain.id}`],
    ['POST', `/admin/users/${plain.id}/credits`],
    ['DELETE', '/admin/reviews/does-not-matter'],
    ['DELETE', '/admin/skills/does-not-matter'],
    ['POST', '/admin/bookings/does-not-matter/cancel']
  ];

  for (const [method, path] of guarded) {
    // No token at all.
    assert.strictEqual((await call(method, path)).status, 401,
      `${method} ${path} is reachable with no token`);
    // A valid token belonging to a plain user.
    assert.strictEqual((await call(method, path, {
      token: plain.token,
      ...(method === 'GET' ? {} : { body: {} })
    })).status, 403, `${method} ${path} is reachable by a non-admin`);
  }

  // --- listing ---
  const list = await call('GET', '/admin/users', { token: admin.token });
  assert.strictEqual(list.status, 200, JSON.stringify(list.body));
  assert.ok(Array.isArray(list.body.results), 'results is not an array');
  assert.ok(typeof list.body.total === 'number', 'total is missing');
  assert.ok(list.body.results.every((u) => u.passwordHash === undefined),
    'the admin user list leaks password hashes');

  const search = await call('GET', `/admin/users?query=${encodeURIComponent(plain.email)}`,
    { token: admin.token });
  assert.strictEqual(search.body.total, 1, 'searching by email did not find exactly one user');

  // --- suspend and reinstate ---
  const suspend = await call('PATCH', `/admin/users/${plain.id}/status`,
    { token: admin.token, body: { status: 'suspended' } });
  assert.strictEqual(suspend.status, 200, JSON.stringify(suspend.body));

  // The point of reading status per request: the existing token stops working.
  assert.strictEqual((await call('GET', '/auth/me', { token: plain.token })).status, 403,
    'a suspended user kept access with their old token');
  assert.strictEqual((await call('POST', '/auth/login',
    { body: { email: plain.email, password: 'whatever' } })).status, 401,
    'login should not reveal that a suspended account exists');

  await call('PATCH', `/admin/users/${plain.id}/status`,
    { token: admin.token, body: { status: 'active' } });
  assert.strictEqual((await call('GET', '/auth/me', { token: plain.token })).status, 200,
    'reinstating did not restore access');

  assert.strictEqual((await call('PATCH', `/admin/users/${plain.id}/status`,
    { token: admin.token, body: { status: 'banished' } })).status, 400,
    'an unknown status was accepted');

  // --- role changes ---
  const promote = await call('PATCH', `/admin/users/${plain.id}/role`,
    { token: admin.token, body: { role: 'admin' } });
  assert.strictEqual(promote.body.role, 'admin', 'promotion did not take');
  assert.strictEqual((await call('GET', '/admin/users', { token: plain.token })).status, 200,
    'a freshly promoted admin cannot reach the admin routes');

  await call('PATCH', `/admin/users/${plain.id}/role`,
    { token: admin.token, body: { role: 'user' } });
  assert.strictEqual((await call('GET', '/admin/users', { token: plain.token })).status, 403,
    'a demoted admin kept access with their old token');

  // An admin must not be able to lock themselves out.
  for (const [path, body] of [
    [`/admin/users/${admin.id}/role`, { role: 'user' }],
    [`/admin/users/${admin.id}/status`, { status: 'suspended' }]
  ]) {
    assert.strictEqual((await call('PATCH', path, { token: admin.token, body })).status, 400,
      `an admin could change their own account via ${path}`);
  }
  assert.strictEqual((await call('DELETE', `/admin/users/${admin.id}`,
    { token: admin.token })).status, 400, 'an admin could delete themselves');

  // --- credit adjustments ---
  const before = (await prisma.user.findUnique({ where: { id: plain.id } })).creditBalance;

  const granted = await call('POST', `/admin/users/${plain.id}/credits`,
    { token: admin.token, body: { amount: 5, reason: 'smoke grant' } });
  assert.strictEqual(granted.status, 200, JSON.stringify(granted.body));
  assert.strictEqual(granted.body.creditBalance, before + 5, 'the grant did not land');

  const deducted = await call('POST', `/admin/users/${plain.id}/credits`,
    { token: admin.token, body: { amount: -5, reason: 'smoke deduction' } });
  assert.strictEqual(deducted.body.creditBalance, before, 'the deduction did not land');

  // Every adjustment is explained by a ledger row.
  const ledger = await prisma.transaction.findMany({
    where: { userId: plain.id, type: 'Adjustment' }
  });
  assert.strictEqual(ledger.length, 2, 'adjustments did not write Transaction rows');
  assert.strictEqual(ledger.reduce((sum, t) => sum + t.amount, 0), 0, 'the ledger does not net to zero');

  // A deduction must never push a balance negative.
  const overdraw = await call('POST', `/admin/users/${plain.id}/credits`,
    { token: admin.token, body: { amount: -(before + 1000), reason: 'overdraw' } });
  assert.strictEqual(overdraw.status, 400, 'an overdraw was allowed');
  assert.strictEqual((await prisma.user.findUnique({ where: { id: plain.id } })).creditBalance, before,
    'a rejected overdraw still moved credits');

  for (const body of [{ amount: 0, reason: 'zero' }, { amount: 5 }, { amount: 'ten', reason: 'words' }]) {
    assert.strictEqual((await call('POST', `/admin/users/${plain.id}/credits`,
      { token: admin.token, body })).status, 400, `${JSON.stringify(body)} was accepted`);
  }

  // --- deleting accounts ---
  assert.strictEqual((await call('DELETE', '/admin/users/00000000-0000-0000-0000-000000000000',
    { token: admin.token })).status, 404, 'deleting an unknown user did not 404');

  const disposable = await newUser('disposable');
  assert.strictEqual((await call('DELETE', `/admin/users/${disposable.id}`,
    { token: admin.token })).status, 200, 'a clean account could not be deleted');
  assert.strictEqual(await prisma.user.count({ where: { id: disposable.id } }), 0,
    'the account survived the delete');

  // An account with bookings is protected — the other party's history and
  // credits hang off it, so it must be suspended rather than removed.
  const teacher = await newUser('bookteacher');
  const learner = await newUser('booklearner');
  const skill = await prisma.skill.create({
    data: {
      userId: teacher.id,
      skillName: 'Smoke Admin Skill',
      description: 'A skill listing created by the admin smoke test',
      level: 'Beginner',
      creditsPerHour: 1
    }
  });
  const booking = await call('POST', '/bookings', {
    token: learner.token,
    body: {
      teacherId: teacher.id,
      skill: skill.skillName,
      skillId: skill.id,
      dateTime: new Date(Date.now() + 86400000).toISOString(),
      duration: 1,
      creditsPerHour: 1
    }
  });
  assert.strictEqual(booking.status, 201, JSON.stringify(booking.body));

  assert.strictEqual((await call('DELETE', `/admin/users/${teacher.id}`,
    { token: admin.token })).status, 409, 'an account with bookings was deleted');

  // --- cancelling someone else's booking refunds the learner ---
  const learnerBefore = (await prisma.user.findUnique({ where: { id: learner.id } })).creditBalance;
  const cancelled = await call('POST', `/admin/bookings/${booking.body.id}/cancel`,
    { token: admin.token });
  assert.strictEqual(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.strictEqual(cancelled.body.status, 'Cancelled');
  assert.strictEqual(cancelled.body.cancelledBy, 'admin', 'cancelledBy was not recorded as admin');
  assert.strictEqual(
    (await prisma.user.findUnique({ where: { id: learner.id } })).creditBalance,
    learnerBefore + booking.body.creditAmount,
    'the learner was not refunded'
  );

  // Cancelling twice must not refund twice — the same guard the learner path has.
  assert.strictEqual((await call('POST', `/admin/bookings/${booking.body.id}/cancel`,
    { token: admin.token })).status, 400, 'a second admin cancel was allowed');
  assert.strictEqual(
    (await prisma.user.findUnique({ where: { id: learner.id } })).creditBalance,
    learnerBefore + booking.body.creditAmount,
    'a double cancel refunded twice'
  );

  // --- removing a skill listing ---
  assert.strictEqual((await call('DELETE', `/admin/skills/${skill.id}`,
    { token: admin.token })).status, 200, 'the skill listing could not be removed');
  assert.strictEqual(await prisma.skill.count({ where: { id: skill.id } }), 0);
  // The booking survives it; skillId is SetNull and the name is its own column.
  assert.strictEqual(await prisma.booking.count({ where: { id: booking.body.id } }), 1,
    'deleting a skill took the booking with it');

  await finish('admin');
})().catch(fail);
