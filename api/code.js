// VEXORA PAIR — pairing code relay (v2, with servers)
// GET /api/code?number=<whatsapp number>&server=<id>
//
// The pairing page (index.html) lives on this Vercel site, but a
// pairing code can only be created by the bot process itself — it
// opens the WhatsApp socket and stores the new session. This function
// validates the number, checks the chosen server's capacity in the
// pairing ledger (lib/ledger.js), then relays the request to the
// bot's own pairing endpoint on Railway and passes its answer back.
// On success the pairing is recorded in the ledger.
//
// If the bot's Railway domain ever changes, update BOT_BASE below —
// nothing else needs to change.

const { SERVERS, readLedger, serverStats, recordPair } = require('../lib/ledger');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj, null, 2));
}

const BOT_BASE = 'https://vexora-smd.up.railway.app';

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    let number = String(searchParams.get('number') || '').replace(/\D/g, '');
    if (number.startsWith('0') && number.length >= 10) {
      number = '92' + number.slice(1);
    }
    if (!number || number.length < 10 || number.length > 15) {
      return sendJson(res, 200, { status: false, message: 'Valid number with country code is required' });
    }

    const serverId = parseInt(searchParams.get('server') || '1', 10);
    const server = SERVERS.find((s) => s.id === serverId) || SERVERS[0];

    // Capacity gate: a number that already paired can always re-pair;
    // a brand-new number is refused when the chosen server is full.
    try {
      const ledger = await readLedger();
      const already = !!(ledger.pairs && ledger.pairs[number]);
      if (!already) {
        const stat = serverStats(ledger).find((s) => s.id === server.id);
        if (stat && stat.full) {
          return sendJson(res, 200, {
            status: false,
            full: true,
            server: server.id,
            message: `${server.name} is full (${stat.used}/${stat.capacity} users). Please try again later.`
          });
        }
      }
    } catch (_) { /* ledger unreadable — never block pairing on it */ }

    const botRes = await fetch(BOT_BASE + '/api/code?number=' + encodeURIComponent(number), {
      signal: AbortSignal.timeout(45000)
    });
    const data = await botRes.json().catch(() => null);
    if (!data) {
      return sendJson(res, 200, { status: false, message: 'Bot did not respond — try again in a moment' });
    }
    if (data.code) {
      await recordPair(number, server.id).catch(() => {});
      return sendJson(res, 200, { status: true, code: data.code, server: server.id });
    }
    return sendJson(res, 200, {
      status: false,
      message: data.error || data.message || 'Failed to get pair code'
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Pairing service unreachable: ' + e.message });
  }
};
