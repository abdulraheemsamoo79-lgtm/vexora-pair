// GET /api/servers — live server list with occupancy for the pair page.
// { status: true, servers: [ { id, name, tag, capacity, used, slots, full } ] }

const { readLedger, serverStats } = require('../lib/ledger');

module.exports = async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  try {
    const ledger = await readLedger();
    res.end(JSON.stringify({ status: true, servers: serverStats(ledger) }, null, 2));
  } catch (e) {
    res.end(JSON.stringify({ status: false, message: e.message, servers: [] }, null, 2));
  }
};
