// Smoke test for the Prisma-backed profile routes.
// Run with the server up: node smoke-profile.js
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
    body: { name: `Smoke ${tag}`, email: `smoke-${tag}-${Date.now()}@example.com`, password: 'secret123' }
  });
  assert.strictEqual(res.status, 201, `register ${tag}: ${JSON.stringify(res.body)}`);
  return res.body.token;
};

(async () => {
  const token = await newUser('owner');
  const other = await newUser('other');

  // GET /profile
  const initial = await call('GET', '/profile', { token });
  assert.strictEqual(initial.status, 200, JSON.stringify(initial.body));
  assert.strictEqual(initial.body.password, undefined, 'password leaked from GET /profile');
  assert.deepStrictEqual(initial.body.skillsToTeach, []);
  assert.deepStrictEqual(initial.body.skillsToLearn, []);

  // PUT /profile
  const updated = await call('PUT', '/profile', {
    token,
    body: { college: 'PES', yearOfStudy: '3', bio: 'hello' }
  });
  assert.strictEqual(updated.status, 200, JSON.stringify(updated.body));
  assert.strictEqual(updated.body.college, 'PES');
  assert.strictEqual(updated.body.password, undefined, 'password leaked from PUT /profile');
  // Blank fields must not wipe existing values.
  const blanked = await call('PUT', '/profile', { token, body: { college: '' } });
  assert.strictEqual(blanked.body.college, 'PES', 'blank college overwrote the stored value');

  // POST /profile/skills/teach
  const bad = await call('POST', '/profile/skills/teach', {
    token,
    body: { skillName: 'Guitar', level: 'Wizard', creditsPerHour: 2, description: 'x' }
  });
  assert.strictEqual(bad.status, 400, 'invalid level was accepted');
  const overPriced = await call('POST', '/profile/skills/teach', {
    token,
    body: { skillName: 'Guitar', level: 'Expert', creditsPerHour: 9, description: 'x' }
  });
  assert.strictEqual(overPriced.status, 400, 'creditsPerHour 9 was accepted');

  const added = await call('POST', '/profile/skills/teach', {
    token,
    body: { skillName: 'Guitar', level: 'Expert', creditsPerHour: 2, description: 'Fingerstyle' }
  });
  assert.strictEqual(added.status, 200, JSON.stringify(added.body));
  assert.strictEqual(added.body.length, 1);
  assert.strictEqual(added.body[0].skillName, 'Guitar');
  const skillId = added.body[0].id;

  // POST /profile/skills/learn — adding twice must not duplicate.
  await call('POST', '/profile/skills/learn', { token, body: { skillName: 'Rust' } });
  const twice = await call('POST', '/profile/skills/learn', { token, body: { skillName: 'Rust' } });
  assert.deepStrictEqual(twice.body, ['Rust'], 'skillsToLearn is not a deduped string array');

  // A different user must not be able to delete this skill.
  const attack = await call('DELETE', `/profile/skills/teach/${skillId}`, { token: other });
  assert.strictEqual(attack.status, 200);
  const stillThere = await call('GET', '/profile', { token });
  assert.strictEqual(stillThere.body.skillsToTeach.length, 1, 'another user deleted the skill');

  // Owner can delete it.
  const removed = await call('DELETE', `/profile/skills/teach/${skillId}`, { token });
  assert.deepStrictEqual(removed.body, [], 'owner could not delete their own skill');

  const unlearned = await call('DELETE', '/profile/skills/learn/Rust', { token });
  assert.deepStrictEqual(unlearned.body, []);

  const noAuth = await call('GET', '/profile');
  assert.strictEqual(noAuth.status, 401, 'profile is reachable without a token');

  console.log('profile smoke test passed');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
