// Smoke test for the Google-backed auth routes.
// Run with the server up: node smoke-auth.js
const assert = require('assert');
const { call, newUser, finish, fail, prisma } = require('./smoke-helpers');

(async () => {
  const user = await newUser('auth');

  // /me returns the signed-in user without leaking anything unexpected.
  const me = await call('GET', '/auth/me', { token: user.token });
  assert.strictEqual(me.status, 200, JSON.stringify(me.body));
  assert.strictEqual(me.body.email, user.email);
  assert.strictEqual(me.body.password, undefined, 'a password field came back');
  assert.strictEqual(me.body.creditBalance, 10, 'creditBalance default is not 10');
  assert.deepStrictEqual(me.body.skillsToLearn, [], 'skillsToLearn is not a string array');
  assert.strictEqual(me.body.profileComplete, true, 'college and year should mark the profile complete');

  // A user without college/year is flagged so the client can collect them.
  const fresh = await newUser('nodetails', { college: null, yearOfStudy: null });
  const freshMe = await call('GET', '/auth/me', { token: fresh.token });
  assert.strictEqual(freshMe.body.profileComplete, false, 'an empty profile should not be complete');

  assert.strictEqual((await call('GET', '/auth/me')).status, 401, '/me is reachable without a token');

  // The password endpoints are gone for good.
  for (const path of ['/auth/login', '/auth/register']) {
    const res = await call('POST', path, { body: { email: 'x@example.com', password: 'x' } });
    assert.strictEqual(res.status, 404, `${path} still exists`);
  }

  // Google sign-in rejects anything it cannot verify with Google.
  assert.strictEqual((await call('POST', '/auth/google', { body: {} })).status, 400,
    'a missing credential was accepted');
  const bogus = await call('POST', '/auth/google', { body: { credential: 'not-a-real-token' } });
  assert.ok([401, 500].includes(bogus.status), `a bogus credential returned ${bogus.status}`);
  assert.strictEqual(await prisma.user.count({ where: { email: 'not-a-real-token' } }), 0);

  await finish('auth');
})().catch(fail);
