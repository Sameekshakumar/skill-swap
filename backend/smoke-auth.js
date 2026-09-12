// Smoke test for the Prisma-backed auth routes: register -> login -> /me.
// Run with the server up: node smoke-auth.js
const assert = require('assert');

const BASE = `http://localhost:${process.env.PORT || 5001}/api/auth`;
const email = `smoke-${Date.now()}@example.com`;
const password = 'secret123';

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};

(async () => {
  const reg = await post('/register', { name: '  Smoke User  ', email: email.toUpperCase(), password });
  assert.strictEqual(reg.status, 201, `register: ${JSON.stringify(reg.body)}`);
  assert.ok(reg.body.token, 'register returned no token');
  assert.strictEqual(reg.body.user.name, 'Smoke User', 'name was not trimmed');
  assert.strictEqual(reg.body.user.email, email, 'email was not lowercased');
  assert.strictEqual(reg.body.user.creditBalance, 10, 'creditBalance default is not 10');

  const dupe = await post('/register', { name: 'Smoke User', email, password });
  assert.strictEqual(dupe.status, 400, 'duplicate email was allowed');

  const badPass = await post('/login', { email, password: 'wrongpassword' });
  assert.strictEqual(badPass.status, 400, 'login accepted a wrong password');

  // Logging in with different casing proves the stored email was normalized.
  const login = await post('/login', { email: email.toUpperCase(), password });
  assert.strictEqual(login.status, 200, `login: ${JSON.stringify(login.body)}`);
  assert.ok(login.body.token, 'login returned no token');

  const meRes = await fetch(BASE + '/me', { headers: { Authorization: `Bearer ${login.body.token}` } });
  const me = await meRes.json();
  assert.strictEqual(meRes.status, 200, `me: ${JSON.stringify(me)}`);
  assert.strictEqual(me.email, email);
  assert.strictEqual(me.password, undefined, 'password leaked from /me');
  assert.deepStrictEqual(me.skillsToLearn, [], 'skillsToLearn is not a string array');
  assert.deepStrictEqual(me.skillsToTeach, [], 'skillsToTeach missing');

  const noAuth = await fetch(BASE + '/me');
  assert.strictEqual(noAuth.status, 401, 'me is reachable without a token');

  console.log('auth smoke test passed');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
