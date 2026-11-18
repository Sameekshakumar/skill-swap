const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { profileFor } = require('../lib/profile');
const redis = require('../lib/redis');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Brute-force protection for /login, counted in Redis. Keyed on the client IP
// *and* the email so one noisy network cannot lock out an unrelated account,
// and hammering one account from many IPs is still capped.
const LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

// The role is deliberately not in the token. middleware/auth.js re-reads the
// user on every request, so a demotion or suspension takes effect at once
// instead of lingering until a 30-day token expires.
const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  college: user.college,
  yearOfStudy: user.yearOfStudy,
  avatarUrl: user.avatarUrl,
  creditBalance: user.creditBalance,
  // The client sends new users to the "finish setting up" step.
  profileComplete: Boolean(user.college && user.yearOfStudy)
});

// Create an account. `role` is never read from the body — everyone registers as
// a plain user, and an existing admin promotes them afterwards.
router.post('/register', [
  check('email', 'A valid email address is required').isEmail(),
  check('password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isLength({ min: MIN_PASSWORD_LENGTH }),
  check('name', 'A name is required').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const email = req.body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: req.body.name.trim(),
        passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
      }
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Registration failed:', error.message);
    res.status(500).json({ error: 'Could not create that account' });
  }
});

router.post('/login', [
  check('email', 'An email address is required').isEmail(),
  check('password', 'A password is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const email = req.body.email.trim().toLowerCase();

    const limitKey = `ratelimit:login:${req.ip}:${email}`;
    const limit = await redis.hit(limitKey, LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!limit.allowed) {
      return res.status(429).json({
        error: `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).`
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // One message for "no such account" and for "wrong password" alike —
    // telling them apart lets anyone test which emails are registered. The
    // comparison still runs against a dummy hash so the reply does not come
    // back noticeably faster for an unknown address.
    const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(req.body.password, hash);

    if (!user || !user.passwordHash || !ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'That account has been suspended' });
    }

    // Getting in clears the counter, so a few typos before the right password
    // do not count against the next sign-in.
    await redis.reset(limitKey);

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ error: 'Could not sign you in' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const profile = await profileFor(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(profile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
