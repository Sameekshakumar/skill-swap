const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user. Role and status are read here rather than carried in the
    // token, so suspending or demoting someone takes effect on their next
    // request instead of when their 30-day token runs out.
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      throw new Error();
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'That account has been suspended' });
    }

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      creditBalance: user.creditBalance
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Always mount behind `auth`, which is what puts the role on the request.
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};

module.exports = auth;
module.exports.authenticateToken = auth;
module.exports.requireAdmin = requireAdmin;
