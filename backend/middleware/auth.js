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

    // Find user
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      throw new Error();
    }

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      creditBalance: user.creditBalance
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

module.exports = auth;
module.exports.authenticateToken = auth;
