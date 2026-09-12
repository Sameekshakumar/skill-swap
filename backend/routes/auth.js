const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { profileFor } = require('../lib/profile');

const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

// Mongoose normalized email/name via schema options; Prisma has no equivalent, so do it here.
const normalizeEmail = (email) => email.trim().toLowerCase();

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  college: user.college,
  yearOfStudy: user.yearOfStudy,
  creditBalance: user.creditBalance
});

// Register user
router.post('/register', [
  check('name', 'Name is required').notEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, college, yearOfStudy } = req.body;

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user (password hashed here — the mongoose pre-save hook is gone)
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizeEmail(email),
        password: await bcrypt.hash(password, 10),
        college: college?.trim(),
        yearOfStudy: yearOfStudy?.trim()
      }
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login user
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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
