const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

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

    const where = {
      // You cannot book yourself, so your own listings are never results.
      userId: { not: req.user.id }
    };

    if (query) {
      const contains = { contains: query, mode: 'insensitive' };
      where.OR = [
        { skillName: contains },
        { description: contains },
        { user: { name: contains } }
      ];
    }

    if (level) where.level = level;
    if (maxRate) where.creditsPerHour = { lte: Number(maxRate) };
    if (minRating) where.user = { ...(where.user || {}), rating: { gte: Number(minRating) } };

    const [total, skills] = await Promise.all([
      prisma.skill.count({ where }),
      prisma.skill.findMany({
        where,
        include: { user: true },
        orderBy: [{ user: { rating: 'desc' } }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    res.json({
      results: skills.map((s) => ({
        skillId: s.id,
        teacherId: s.user.id,
        teacherName: s.user.name,
        teacherCollege: s.user.college,
        teacherYear: s.user.yearOfStudy,
        teacherBio: s.user.bio,
        teacherAvatar: s.user.avatarUrl,
        skillName: s.skillName,
        level: s.level,
        creditsPerHour: s.creditsPerHour,
        description: s.description,
        teacherRating: s.user.rating,
        teacherReviews: s.user.reviewCount
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
