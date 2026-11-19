const prisma = require('./prisma');

// The curriculum comes along with the skill everywhere it is read, so the
// profile page can render and edit it without a second round trip.
const MODULES = { orderBy: { position: 'asc' } };

const teachSkillsFor = (userId) =>
  prisma.skill.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { modules: MODULES }
  });

// skillsToLearn was an array of plain strings under mongoose — keep that shape.
const learnSkillsFor = async (userId) => {
  const skills = await prisma.skillToLearn.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });
  return skills.map((s) => s.skillName);
};

// The full user with both skill lists attached.
const profileFor = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      skillsToTeach: { orderBy: { createdAt: 'asc' }, include: { modules: MODULES } }
    }
  });
  if (!user) return null;

  // The whole user is spread into the response, so anything secret has to come
  // off here — this shape is what both /auth/me and GET /profile return.
  const { passwordHash, ...safe } = user;

  return {
    ...safe,
    skillsToLearn: await learnSkillsFor(userId),
    // Drives the "finish setting up" step after registering.
    profileComplete: Boolean(user.college && user.yearOfStudy)
  };
};

module.exports = { teachSkillsFor, learnSkillsFor, profileFor, MODULES };
