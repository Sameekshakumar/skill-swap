// Promote an existing account to admin.
//
//   node make-admin.js someone@example.com
//
// The API deliberately cannot mint the first admin — /auth/register always
// creates a plain user, and PATCH /admin/users/:id/role needs an admin to call
// it. This script is the way in. Register through the app first, then run it.
require('dotenv').config();
const prisma = require('./lib/prisma');

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: node make-admin.js <email>');
  process.exit(1);
}

prisma.user
  .update({ where: { email }, data: { role: 'admin' } })
  .then((user) => console.log(`${user.email} is now an admin`))
  .catch((error) => {
    if (error.code === 'P2025') {
      console.error(`No account found for ${email}. Register it in the app first.`);
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
