const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { searchSkills } = require('../lib/skillSearch');

const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

// Find teachers. Filtering and paging happen in the database — the page used to
// fetch a fixed slice and filter it in the browser, which silently hid results
// once there were more listings than the slice.
router.get('/teachers/search', auth, async (req, res) => {
  try {
    const { query, level, maxRate, minRating } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || PAGE_SIZE));

    const { rows, total } = await searchSkills({
      viewerId: req.user.id,
      query,
      level,
      maxRate,
      minRating,
      page,
      limit
    });

    res.json({
      results: rows.map((row) => ({
        skillId: row.id,
        teacherId: row.uid,
        teacherName: row.name,
        teacherCollege: row.college,
        teacherYear: row.yearOfStudy,
        teacherBio: row.bio,
        teacherAvatar: row.avatarUrl,
        skillName: row.skillName,
        level: row.level,
        creditsPerHour: row.creditsPerHour,
        description: row.description,
        teacherRating: row.rating,
        teacherReviews: row.reviewCount
      })),
      total,
      page,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('Error searching teachers:', error);
    res.status(500).json({ error: 'Error searching teachers' });
  }
});

// A teacher's public profile: what they teach and how they are rated. Contact
// details are deliberately not included.
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        college: true,
        yearOfStudy: true,
        bio: true,
        avatarUrl: true,
        rating: true,
        reviewCount: true,
        createdAt: true,
        skillsToTeach: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching user profile' });
  }
});

module.exports = router;
