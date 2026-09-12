const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { profileFor } = require('../lib/profile');

// Get all teachers (users with skills to teach)
router.get('/teachers/search', async (req, res) => {
  try {
    const { skill } = req.query;

    // Querying from the skill side gives the flattened rows directly and
    // naturally excludes users with nothing to teach.
    const skills = await prisma.skill.findMany({
      where: skill ? { skillName: { contains: skill, mode: 'insensitive' } } : {},
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(skills.map((s) => ({
      teacherId: s.user.id,
      teacherName: s.user.name,
      teacherEmail: s.user.email,
      teacherCollege: s.user.college,
      teacherYear: s.user.yearOfStudy,
      teacherBio: s.user.bio,
      skillName: s.skillName,
      level: s.level,
      creditsPerHour: s.creditsPerHour,
      description: s.description,
      teacherRating: s.user.rating,
      teacherReviews: s.user.reviewCount
    })));
  } catch (error) {
    console.error('Error searching teachers:', error);
    res.status(500).json({ error: 'Error searching teachers' });
  }
});

// Search users
router.get('/', auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'A search query is required' });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 50
    });

    res.json(users.map(({ password, ...rest }) => rest));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error searching users' });
  }
});

// Get user profile
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await profileFor(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching user profile' });
  }
});

// Update user profile
router.put('/:id', auth, [
  check('email', 'Please include a valid email').optional().isEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // This route had no auth at all under mongoose — anyone could rewrite any
  // user's name and email. Callers may only update themselves.
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ error: 'You can only update your own profile' });
  }

  try {
    const { name, email } = req.body;
    const data = {};
    if (name) data.name = name.trim();
    if (email) data.email = email.trim().toLowerCase();

    const user = await prisma.user.update({ where: { id: req.params.id }, data });

    const { password, ...rest } = user;
    res.json(rest);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'That email is already in use' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating user profile' });
  }
});

module.exports = router;
