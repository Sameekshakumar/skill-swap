const prisma = require('./prisma');

const teachSkillsFor = (userId) =>
  prisma.skill.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

// skillsToLearn was an array of plain strings under mongoose — keep that shape.
const learnSkillsFor = async (userId) => {
  const skills = await prisma.skillToLearn.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });
  return skills.map((s) => s.skillName);
};

// The full user minus the password hash, with both skill lists attached.
const profileFor = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { skillsToTeach: { orderBy: { createdAt: 'asc' } } }
  });
  if (!user) return null;

  const { password, ...rest } = user;
  return { ...rest, skillsToLearn: await learnSkillsFor(userId) };
};

module.exports = { teachSkillsFor, learnSkillsFor, profileFor };
