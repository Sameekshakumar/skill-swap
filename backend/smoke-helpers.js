// Shared helpers for the smoke tests.
//
// Sign-in normally requires a Google-issued token, which a script cannot get.
// Tests create users directly and mint the same JWT the server would issue, so
// they exercise every route behind the token without faking Google itself.
const jwt = require('jsonwebtoken');
require('dotenv').config();

const prisma = require('./lib/prisma');

const BASE = `http://localhost:${process.env.PORT || 5001}/api`;

const call = async (method, path, { token, body, raw } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  if (raw) return { status: res.status, body: text };
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

let counter = 0;

const newUser = async (tag, extra = {}) => {
  counter += 1;
  const email = `smoke-${tag}-${Date.now()}-${counter}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      googleId: `smoke-google-${Date.now()}-${counter}`,
      name: `Smoke ${tag}`,
      college: 'Smoke College',
      yearOfStudy: '3rd Year',
      ...extra
    }
  });

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { token, id: user.id, email, name: user.name };
};

const cleanup = async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'smoke-' } },
    select: { id: true }
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return 0;

  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.review.deleteMany({
    where: { OR: [{ reviewerId: { in: ids } }, { revieweeId: { in: ids } }] }
  });
  await prisma.booking.deleteMany({
    where: { OR: [{ teacherId: { in: ids } }, { learnerId: { in: ids } }] }
  });
  await prisma.skillToLearn.deleteMany({ where: { userId: { in: ids } } });
  await prisma.skill.deleteMany({ where: { userId: { in: ids } } });
  const removed = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return removed.count;
};

const finish = async (label) => {
  await cleanup();
  await prisma.$disconnect();
  console.log(`${label} smoke test passed`);
};

const fail = async (err) => {
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  console.error(err.message);
  process.exit(1);
};

module.exports = { BASE, call, newUser, cleanup, finish, fail, prisma };
