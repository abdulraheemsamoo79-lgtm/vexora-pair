// Portal config — mirrors config.php from the original PHP portal.
// Credentials live here, in one place, exactly like the original.
// You can also override them with the ADMIN_USER / ADMIN_PASS
// environment variables if you ever want to.

module.exports = {
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'ali'
};
