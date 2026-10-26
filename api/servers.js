// GET /api/servers — the public server list for the pairing page.
// Same array the PHP portal injected into index.php, now fetched.

const { loadServersLive } = require('../lib/store');

module.exports = async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(await loadServersLive()));
};
