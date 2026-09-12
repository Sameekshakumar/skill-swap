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

  // Search needs a token and returns one flat row per skill.
  assert.strictEqual((await call('GET', '/users/teachers/search')).status, 401,
    'teacher search is reachable without a token');

  const search = await call('GET', `/users/teachers/search?skill=${unique.toLowerCase()}`, { token: other.token });
  assert.strictEqual(search.status, 200, JSON.stringify(search.body));
  assert.strictEqual(search.body.length, 1, 'case-insensitive skill filter did not match');
  const row = search.body[0];
  assert.strictEqual(row.teacherId, teacher.id);
  assert.ok(row.skillId, 'skillId is missing - the UI needs it as a list key');
  assert.strictEqual(row.skillName, unique);
  assert.strictEqual(row.level, 'Advanced');
  assert.strictEqual(row.creditsPerHour, 3);
  assert.strictEqual(row.description, 'Strumming');
  assert.strictEqual(row.teacherRating, 0);
  assert.strictEqual(row.teacherReviews, 0);
  assert.strictEqual(row.teacherEmail, undefined, 'search is leaking email addresses');

  // A user with no skills must not appear.
  const all = await call('GET', '/users/teachers/search', { token: other.token });
  assert.ok(!all.body.some((r) => r.teacherId === other.id), 'a user with no skills was listed');

  // The removed endpoints should be gone for good.
  for (const [method, path] of [['GET', `/users/${teacher.id}`], ['PUT', `/users/${teacher.id}`], ['GET', '/users?query=smoke']]) {
    const res = await call(method, path, {
      token: teacher.token,
      ...(method === 'PUT' ? { body: { name: 'x' } } : {})
    });
    assert.strictEqual(res.status, 404, `${method} ${path} still exists`);
  }

  console.log('users smoke test passed');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
