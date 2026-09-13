// Smoke test for semantic skill search.
// Run with the server up: node smoke-search.js
//
// The first run is slow: the embedding model loads on first use.
const assert = require('assert');
const { call, newUser, finish, fail } = require('./smoke-helpers');

const teach = (token, skillName, level, creditsPerHour, description) =>
  call('POST', '/profile/skills/teach', {
    token,
    body: { skillName, level, creditsPerHour, description }
  });

const search = async (token, query) => {
  const res = await call('GET', `/users/teachers/search?query=${encodeURIComponent(query)}`, { token });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.results.map((r) => r.skillName);
};

(async () => {
  const teacher = await newUser('search-teacher');
  const seeker = await newUser('search-seeker');

  // Tagged so results cannot collide with anything else in the database.
  const tag = `Zq${Date.now()}`;
  const guitar = `Guitar${tag}`;
  const photo = `Photography${tag}`;

  await teach(teacher.token, guitar, 'Beginner', 1, 'Chords, strumming patterns and your first few songs');
  await teach(teacher.token, photo, 'Beginner', 1, 'Composition, exposure and editing your photos afterwards');

  // Embeddings are generated in the background after the skill is saved.
  await new Promise((r) => setTimeout(r, 6000));

  // Keyword matching still works.
  assert.ok((await search(seeker.token, guitar)).includes(guitar), 'exact name did not match');

  // The point of the exercise: a query sharing no words with the skill.
  const instrument = await search(seeker.token, 'I want to learn to play an instrument');
  assert.ok(instrument.includes(guitar), `"learn an instrument" did not find the guitar skill (got ${instrument})`);

  const pictures = await search(seeker.token, 'teach me to take better pictures');
  assert.ok(pictures.includes(photo), `"take better pictures" did not find the photography skill (got ${pictures})`);

  // Unrelated queries must stay empty, or the floor is too low to be useful.
  const nonsense = await search(seeker.token, 'underwater basket weaving championships');
  assert.ok(!nonsense.includes(guitar) && !nonsense.includes(photo),
    `an unrelated query matched: ${nonsense}`);

  // Filters still apply alongside the ranking.
  const filtered = await call(
    'GET',
    `/users/teachers/search?query=${encodeURIComponent('learn an instrument')}&level=Advanced`,
    { token: seeker.token }
  );
  assert.ok(!filtered.body.results.some((r) => r.skillName === guitar),
    'the level filter was ignored once a query was supplied');

  await finish('search');
})().catch(fail);
