// Portal config — mirrors config.php from the original PHP portal.
// Admin credentials are read from the project's environment
// variables (Vercel → Settings → Environment Variables):
//   ADMIN_USER, ADMIN_PASS
// They are intentionally not written in this file.

module.exports = {
  ADMIN_USER: process.env.ADMIN_USER || '',
  ADMIN_PASS: process.env.ADMIN_PASS || ''
};
