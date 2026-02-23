const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// Get user profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Update user profile
router.put('/', auth, async (req, res) => {
  const { name, college, yearOfStudy, bio } = req.body;

  try {
    let user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.name = name || user.name;
    user.college = college || user.college;
    user.yearOfStudy = yearOfStudy || user.yearOfStudy;
    user.bio = bio || user.bio;

    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a teaching skill
router.post('/skills/teach', auth, async (req, res) => {
  const { skillName, level, creditsPerHour, description } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.skillsToTeach.push({
      skillName,
      level,
      creditsPerHour,
      description
    });

    await user.save();
    res.json(user.skillsToTeach);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a learning skill
router.post('/skills/learn', auth, async (req, res) => {
  const { skillName } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (!user.skillsToLearn.includes(skillName)) {
      user.skillsToLearn.push(skillName);
    }

    await user.save();
    res.json(user.skillsToLearn);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remove a teaching skill
router.delete('/skills/teach/:skillId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.skillsToTeach = user.skillsToTeach.filter(
      skill => skill._id.toString() !== req.params.skillId
    );

    await user.save();
    res.json(user.skillsToTeach);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remove a learning skill
router.delete('/skills/learn/:skillName', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.skillsToLearn = user.skillsToLearn.filter(
      skill => skill !== req.params.skillName
    );

    await user.save();
    res.json(user.skillsToLearn);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;