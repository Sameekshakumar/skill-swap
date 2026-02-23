const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get all teachers (users with skills to teach)
router.get('/teachers/search', async (req, res) => {
  try {
    const { skill, query } = req.query;
    let searchFilter = {};
    
    if (skill) {
      searchFilter['skillsToTeach.skillName'] = { $regex: skill, $options: 'i' };
    }
    
    const teachers = await User.find(searchFilter)
      .where('skillsToTeach').ne([]) // Only users with skills to teach
      .select('-password')
      .limit(50);
    
    // Flatten skills for easier access
    const teachersWithSkills = teachers.map(teacher => {
      const teachingSkills = teacher.skillsToTeach.map(skill => ({
        teacherId: teacher._id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        teacherCollege: teacher.college,
        teacherYear: teacher.yearOfStudy,
        teacherBio: teacher.bio,
        skillName: skill.skillName,
        level: skill.level,
        creditsPerHour: skill.creditsPerHour,
        description: skill.description,
        teacherRating: teacher.rating,
        teacherReviews: teacher.reviewCount
      }));
      return teachingSkills;
    }).flat();
    
    res.json(teachersWithSkills);
  } catch (error) {
    console.error('Error searching teachers:', error);
    res.status(500).json({ error: 'Error searching teachers' });
  }
});

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user profile' });
  }
});

// Update user profile
router.put('/:id', async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error updating user profile' });
  }
});

// Search users
router.get('/', async (req, res) => {
  try {
    const { query } = req.query;
    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error searching users' });
  }
});

module.exports = router;