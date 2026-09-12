// Smoke test for the Prisma-backed user routes.
// Run with the server up: node smoke-users.js
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
  const email = `smoke-${tag}-${Date.now()}@example.com`;
  const res = await call('POST', '/auth/register', {
    body: { name: `Smoke ${tag}`, email, password: 'secret123' }
  });
  assert.strictEqual(res.status, 201, `register ${tag}: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id, email };
};

(async () => {
  const teacher = await newUser('teacher');
  const other = await newUser('other');

  const unique = `Ukulele${Date.now()}`;
  await call('POST', '/profile/skills/teach', {
    token: teacher.token,
    body: { skillName: unique, level: 'Advanced', creditsPerHour: 3, description: 'Strumming' }
  });

  // Search is public and returns one flat row per skill.
  const search = await call('GET', `/users/teachers/search?skill=${unique.toLowerCase()}`);
  assert.strictEqual(search.status, 200, JSON.stringify(search.body));
  assert.strictEqual(search.body.length, 1, 'case-insensitive skill filter did not match');
  const row = search.body[0];
  assert.strictEqual(row.teacherId, teacher.id);
  assert.strictEqual(row.skillName, unique);
  assert.strictEqual(row.level, 'Advanced');
  assert.strictEqual(row.creditsPerHour, 3);
  assert.strictEqual(row.description, 'Strumming');
  assert.strictEqual(row.teacherRating, 0);
  assert.strictEqual(row.teacherReviews, 0);

  // A user with no skills must not appear.
  const all = await call('GET', '/users/teachers/search');
  assert.ok(!all.body.some((r) => r.teacherId === other.id), 'a user with no skills was listed');

  // GET /users/:id
  const profile = await call('GET', `/users/${teacher.id}`, { token: other.token });
  assert.strictEqual(profile.status, 200, JSON.stringify(profile.body));
  assert.strictEqual(profile.body.password, undefined, 'password leaked from GET /users/:id');
  assert.strictEqual(profile.body.skillsToTeach.length, 1);
  assert.strictEqual((await call('GET', `/users/${teacher.id}`)).status, 401, 'GET /users/:id needs a token');

  // PUT /users/:id must reject everyone but the owner.
  const attack = await call('PUT', `/users/${teacher.id}`, {
    token: other.token,
    body: { name: 'Hacked', email: 'attacker@example.com' }
  });
  assert.strictEqual(attack.status, 403, 'another user updated this profile');
  const anon = await call('PUT', `/users/${teacher.id}`, { body: { name: 'Hacked' } });
  assert.strictEqual(anon.status, 401, 'PUT /users/:id is reachable without a token');
  const untouched = await call('GET', `/users/${teacher.id}`, { token: other.token });
  assert.strictEqual(untouched.body.name, 'Smoke teacher', 'the name was changed by a non-owner');

  // The owner can update, and a taken email is rejected.
  const mine = await call('PUT', `/users/${teacher.id}`, { token: teacher.token, body: { name: 'Renamed' } });
  assert.strictEqual(mine.status, 200, JSON.stringify(mine.body));
  assert.strictEqual(mine.body.name, 'Renamed');
  assert.strictEqual(mine.body.password, undefined, 'password leaked from PUT /users/:id');
  const taken = await call('PUT', `/users/${teacher.id}`, { token: teacher.token, body: { email: other.email } });
  assert.strictEqual(taken.status, 400, 'a duplicate email was accepted');

  // GET /users
  assert.strictEqual((await call('GET', '/users?query=smoke')).status, 401, 'user search needs a token');
  const noQuery = await call('GET', '/users', { token: teacher.token });
  assert.strictEqual(noQuery.status, 400, 'user search ran without a query');
  const found = await call('GET', '/users?query=Renamed', { token: teacher.token });
  assert.strictEqual(found.status, 200, JSON.stringify(found.body));
  assert.ok(found.body.some((u) => u.id === teacher.id), 'name search did not find the user');
  assert.ok(found.body.every((u) => u.password === undefined), 'password leaked from user search');

  console.log('users smoke test passed');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
