const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { profileFor } = require('../lib/profile');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  college: user.college,
  yearOfStudy: user.yearOfStudy,
  avatarUrl: user.avatarUrl,
  creditBalance: user.creditBalance,
  // The client sends new users to the "finish setting up" step.
  profileComplete: Boolean(user.college && user.yearOfStudy)
});

// Sign in with Google. The browser gets an ID token from Google and posts it
// here; we verify its signature with Google before trusting anything in it.
router.post('/google', [
  check('credential', 'A Google credential is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID is not set');
    return res.status(500).json({ error: 'Google sign-in is not configured on the server' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload?.email_verified) {
      return res.status(401).json({ error: 'That Google account has no verified email address' });
    }

    const googleId = payload.sub;
    const email = payload.email.trim().toLowerCase();

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // An account may predate Google sign-in, or have been created by an
      // invite; match on email and attach the Google id rather than making a
      // second account for the same person.
      const existing = await prisma.user.findUnique({ where: { email } });

      user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: { googleId, avatarUrl: payload.picture ?? existing.avatarUrl }
          })
        : await prisma.user.create({
            data: {
              googleId,
              email,
              name: payload.name?.trim() || email.split('@')[0],
              avatarUrl: payload.picture
            }
          });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Google sign-in failed:', error.message);
    res.status(401).json({ error: 'Could not verify that Google sign-in' });
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
