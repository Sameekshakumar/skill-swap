const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

// Get all teachers (users with skills to teach)
router.get('/teachers/search', auth, async (req, res) => {
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
      skillId: s.id,
      teacherId: s.user.id,
      teacherName: s.user.name,
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

module.exports = router;
