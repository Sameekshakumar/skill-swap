const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const { teachSkillsFor, learnSkillsFor, profileFor } = require('../lib/profile');
const { storeEmbeddingSafely } = require('../lib/skillSearch');

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

// Get user profile
router.get('/', auth, async (req, res) => {
  try {
    const profile = await profileFor(req.user.id);
    if (!profile) return res.status(404).json({ msg: 'User not found' });

    res.json(profile);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Update user profile
router.put('/', auth, async (req, res) => {
  const { name, college, yearOfStudy, bio } = req.body;

  try {
    // Blank values leave the existing field alone, matching the old `name || user.name`.
    const data = {};
    if (name) data.name = name.trim();
    if (college) data.college = college;
    if (yearOfStudy) data.yearOfStudy = yearOfStudy;
    if (bio) data.bio = bio;

    await prisma.user.update({ where: { id: req.user.id }, data });

    res.json(await profileFor(req.user.id));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ msg: 'User not found' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a teaching skill
router.post('/skills/teach', auth, [
  check('skillName', 'Skill name is required').notEmpty(),
  check('level', `Level must be one of: ${SKILL_LEVELS.join(', ')}`).isIn(SKILL_LEVELS),
  check('creditsPerHour', 'Credits per hour must be between 1 and 3').isInt({ min: 1, max: 3 }),
  check('description', 'Description is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { skillName, level, creditsPerHour, description } = req.body;

  try {
    const created = await prisma.skill.create({
      data: {
        skillName: skillName.trim(),
        level,
        creditsPerHour: Number(creditsPerHour),
        description,
        userId: req.user.id
      }
    });

    // Generated in the background: the skill is already saved, and search
    // still finds it by keyword until the embedding lands.
    storeEmbeddingSafely(created.id, created);

    res.json(await teachSkillsFor(req.user.id));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a learning skill
router.post('/skills/learn', auth, [
  check('skillName', 'Skill name is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Adding the same skill twice is a no-op, as it was with the old `includes` guard.
    const skillName = req.body.skillName.trim();
    await prisma.skillToLearn.upsert({
      where: { userId_skillName: { userId: req.user.id, skillName } },
      create: { userId: req.user.id, skillName },
      update: {}
    });

    res.json(await learnSkillsFor(req.user.id));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remove a teaching skill
router.delete('/skills/teach/:skillId', auth, async (req, res) => {
  try {
    // Scoped to the caller: skills now live in a shared table, so an unscoped
    // delete by id would let anyone remove anyone else's skill.
    await prisma.skill.deleteMany({
      where: { id: req.params.skillId, userId: req.user.id }
    });

    res.json(await teachSkillsFor(req.user.id));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remove a learning skill
router.delete('/skills/learn/:skillName', auth, async (req, res) => {
  try {
    await prisma.skillToLearn.deleteMany({
      where: { skillName: req.params.skillName, userId: req.user.id }
    });

    res.json(await learnSkillsFor(req.user.id));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
