// Smoke test for teacher search and public profiles.
// Run with the server up: node smoke-users.js
const assert = require('assert');
const { call, newUser, finish, fail } = require('./smoke-helpers');

const teach = (token, skillName, level, creditsPerHour, description) =>
  call('POST', '/profile/skills/teach', {
    token,
    body: { skillName, level, creditsPerHour, description }
  });

(async () => {
  const teacher = await newUser('teacher');
  const other = await newUser('other');

  const unique = `Ukulele${Date.now()}`;
  const added = await teach(teacher.token, unique, 'Advanced', 3, 'Strumming patterns');
  assert.strictEqual(added.status, 200, JSON.stringify(added.body));

  // Search needs a token.
  assert.strictEqual((await call('GET', '/users/teachers/search')).status, 401,
    'teacher search is reachable without a token');

  // Filtering happens server side, and matching is case-insensitive.
  const search = await call('GET', `/users/teachers/search?query=${unique.toLowerCase()}`, { token: other.token });
  assert.strictEqual(search.status, 200, JSON.stringify(search.body));
  assert.strictEqual(search.body.total, 1, 'server-side query did not match');
  const row = search.body.results[0];
  assert.strictEqual(row.teacherId, teacher.id);
  assert.ok(row.skillId, 'skillId is missing - the UI needs it as a list key');
  assert.strictEqual(row.level, 'Advanced');
  assert.strictEqual(row.creditsPerHour, 3);
  assert.strictEqual(row.teacherEmail, undefined, 'search is leaking email addresses');

  // The description and the teacher's name are searchable too.
  assert.strictEqual((await call('GET', '/users/teachers/search?query=Strumming', { token: other.token })).body.total, 1,
    'description is not searchable');
  assert.ok((await call('GET', `/users/teachers/search?query=${encodeURIComponent(teacher.name)}`, { token: other.token })).body.total >= 1,
    'teacher name is not searchable');

  // Filters.
  assert.strictEqual((await call('GET', `/users/teachers/search?query=${unique}&level=Beginner`, { token: other.token })).body.total, 0,
    'level filter did not apply');
  assert.strictEqual((await call('GET', `/users/teachers/search?query=${unique}&maxRate=2`, { token: other.token })).body.total, 0,
    'maxRate filter did not apply');
  assert.strictEqual((await call('GET', `/users/teachers/search?query=${unique}&maxRate=3`, { token: other.token })).body.total, 1,
    'maxRate excluded an affordable skill');
  assert.strictEqual((await call('GET', `/users/teachers/search?query=${unique}&minRating=4`, { token: other.token })).body.total, 0,
    'minRating filter did not apply');

  // Your own listings are never results — you cannot book yourself.
  const ownView = await call('GET', `/users/teachers/search?query=${unique}`, { token: teacher.token });
  assert.strictEqual(ownView.body.total, 0, 'a teacher can see their own listing in search');

  // Paging: 3 skills at a page size of 2 spans two pages with no overlap.
  const pager = await newUser('pager');
  const tag = `Paged${Date.now()}`;
  for (const n of [1, 2, 3]) {
    await teach(pager.token, `${tag}-${n}`, 'Beginner', 1, 'desc');
  }
  const first = await call('GET', `/users/teachers/search?query=${tag}&limit=2`, { token: other.token });
  assert.strictEqual(first.body.total, 3, 'total should count every match, not just this page');
  assert.strictEqual(first.body.results.length, 2, 'page size was ignored');
  assert.strictEqual(first.body.hasMore, true, 'hasMore should be true with a page left');

  const second = await call('GET', `/users/teachers/search?query=${tag}&limit=2&page=2`, { token: other.token });
  assert.strictEqual(second.body.results.length, 1);
  assert.strictEqual(second.body.hasMore, false, 'hasMore should be false on the last page');
  const ids = [...first.body.results, ...second.body.results].map((r) => r.skillId);
  assert.strictEqual(new Set(ids).size, 3, 'pages overlap or repeat rows');

  // Public profile.
  const profile = await call('GET', `/users/${teacher.id}`, { token: other.token });
  assert.strictEqual(profile.status, 200, JSON.stringify(profile.body));
  assert.strictEqual(profile.body.name, teacher.name);
  assert.strictEqual(profile.body.skillsToTeach.length, 1);
  assert.strictEqual(profile.body.email, undefined, 'the public profile is leaking an email address');
  assert.strictEqual(profile.body.googleId, undefined, 'the public profile is leaking the Google id');
  assert.strictEqual(profile.body.creditBalance, undefined, 'the public profile is leaking a credit balance');

  assert.strictEqual((await call('GET', `/users/${teacher.id}`)).status, 401, 'public profile needs a token');
  assert.strictEqual((await call('GET', '/users/does-not-exist', { token: other.token })).status, 404);

  // The write endpoints stay gone.
  assert.strictEqual((await call('PUT', `/users/${teacher.id}`, { token: teacher.token, body: { name: 'x' } })).status, 404,
    'PUT /users/:id still exists');

  await finish('users');
})().catch(fail);
