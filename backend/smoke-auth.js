// Smoke test for the password auth routes.
// Run with the server up: node smoke-auth.js
const assert = require('assert');
const { call, newUser, finish, fail, prisma } = require('./smoke-helpers');

const PASSWORD = 'smoke-password-123';

(async () => {
  const user = await newUser('auth');

  // /me returns the signed-in user without leaking anything unexpected.
  const me = await call('GET', '/auth/me', { token: user.token });
  assert.strictEqual(me.status, 200, JSON.stringify(me.body));
  assert.strictEqual(me.body.email, user.email);
  assert.strictEqual(me.body.password, undefined, 'a password field came back');
  assert.strictEqual(me.body.passwordHash, undefined, 'the password hash leaked through /auth/me');
  assert.strictEqual(me.body.role, 'user', 'a new account should not be an admin');
  assert.strictEqual(me.body.creditBalance, 10, 'creditBalance default is not 10');
  assert.deepStrictEqual(me.body.skillsToLearn, [], 'skillsToLearn is not a string array');
  assert.strictEqual(me.body.profileComplete, true, 'college and year should mark the profile complete');

  // The same shape is served by GET /profile, which is what the client reads.
  const profile = await call('GET', '/profile', { token: user.token });
  assert.strictEqual(profile.body.passwordHash, undefined, 'the password hash leaked through /profile');

  // A user without college/year is flagged so the client can collect them.
  const fresh = await newUser('nodetails', { college: null, yearOfStudy: null });
  const freshMe = await call('GET', '/auth/me', { token: fresh.token });
  assert.strictEqual(freshMe.body.profileComplete, false, 'an empty profile should not be complete');

  assert.strictEqual((await call('GET', '/auth/me')).status, 401, '/me is reachable without a token');

  // --- register ---
  const email = `smoke-register-${Date.now()}@example.com`;
  const registered = await call('POST', '/auth/register', {
    body: { email, password: PASSWORD, name: 'Smoke Register' }
  });
  assert.strictEqual(registered.status, 201, JSON.stringify(registered.body));
  assert.ok(registered.body.token, 'register did not return a token');
  assert.strictEqual(registered.body.user.role, 'user');
  assert.strictEqual(registered.body.user.passwordHash, undefined, 'register leaked the hash');

  // The password is stored hashed, never in the clear.
  const stored = await prisma.user.findUnique({ where: { email } });
  assert.ok(stored.passwordHash && stored.passwordHash !== PASSWORD, 'password was not hashed');

  // Registering can never hand out an admin account, whatever the body says.
  const sneaky = await call('POST', '/auth/register', {
    body: { email: `smoke-sneaky-${Date.now()}@example.com`, password: PASSWORD, name: 'Sneaky', role: 'admin' }
  });
  assert.strictEqual(sneaky.body.user.role, 'user', 'register honoured a role from the body');

  // Duplicate email, short password and a missing name are all rejected.
  assert.strictEqual((await call('POST', '/auth/register', {
    body: { email, password: PASSWORD, name: 'Dupe' }
  })).status, 409, 'a duplicate email was accepted');
  assert.strictEqual((await call('POST', '/auth/register', {
    body: { email: `smoke-short-${Date.now()}@example.com`, password: 'short', name: 'Short' }
  })).status, 400, 'a 5-character password was accepted');
  assert.strictEqual((await call('POST', '/auth/register', {
    body: { email: `smoke-noname-${Date.now()}@example.com`, password: PASSWORD, name: '  ' }
  })).status, 400, 'a blank name was accepted');

  // --- login ---
  const ok = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token, 'login did not return a token');

  // The token it issues actually works.
  const asLoggedIn = await call('GET', '/auth/me', { token: ok.body.token });
  assert.strictEqual(asLoggedIn.body.email, email);

  // Email is matched case-insensitively, the way registration normalises it.
  assert.strictEqual((await call('POST', '/auth/login', {
    body: { email: email.toUpperCase(), password: PASSWORD }
  })).status, 200, 'login is case-sensitive on email');

  // A wrong password and an unknown address must be indistinguishable —
  // otherwise anyone can test which emails have accounts.
  const wrongPassword = await call('POST', '/auth/login', { body: { email, password: 'wrong-password' } });
  const unknownEmail = await call('POST', '/auth/login', {
    body: { email: `smoke-ghost-${Date.now()}@example.com`, password: PASSWORD }
  });
  assert.strictEqual(wrongPassword.status, 401, 'a wrong password was accepted');
  assert.strictEqual(unknownEmail.status, 401, 'an unknown email was accepted');
  assert.deepStrictEqual(wrongPassword.body, unknownEmail.body,
    'wrong password and unknown email give different replies, which leaks who has an account');

  // --- suspension ---
  const suspended = await newUser('suspended', { status: 'suspended' });
  assert.strictEqual((await call('GET', '/auth/me', { token: suspended.token })).status, 403,
    'a suspended account can still use an existing token');

  // Google sign-in is gone.
  assert.strictEqual((await call('POST', '/auth/google', {
    body: { credential: 'anything' }
  })).status, 404, '/auth/google still exists');

  await finish('auth');
})().catch(fail);
