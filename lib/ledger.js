// Pairing ledger — who paired through this site, and on which server.
//
// Storage: a small JSON file in this repo (data/servers.json).
//   { "pairs": { "<number>": { "server": 1, "at": "<iso date>" } } }
//
// Reads work without any token (public raw file). Writes (recording a
// new pairing) need the LEDGER_TOKEN env var on Vercel: a fine-grained
// GitHub token with Contents read/write on THIS repo only. Without the
// token the site still pairs normally — the capacity gate then works
// from the last recorded counts instead of live writes.
//
// Server capacity is enforced here, at the public door: when a server
// is full, the relay refuses to forward new numbers to the bot, so
// the bot process never gets overloaded by public pairings.

const REPO = 'abdulraheemsamoo79-lgtm/vexora-pair';
const LEDGER_PATH = 'data/servers.json';

const SERVERS = [
  { id: 1, name: 'Server 1', capacity: 30, tag: 'MAIN' }
];

async function readLedger() {
  try {
    const url = `https://raw.githubusercontent.com/${REPO}/main/${LEDGER_PATH}?t=${Date.now()}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('ledger ' + r.status);
    const data = await r.json();
    if (data && typeof data === 'object' && data.pairs) return data;
  } catch (_) { /* fall through to empty */ }
  return { pairs: {} };
}

function serverStats(ledger) {
  const pairs = ledger.pairs || {};
  return SERVERS.map((s) => {
    const used = Object.values(pairs).filter((p) => p && p.server === s.id).length;
    return {
      id: s.id,
      name: s.name,
      tag: s.tag,
      capacity: s.capacity,
      used,
      slots: Math.max(0, s.capacity - used),
      full: used >= s.capacity
    };
  });
}

async function recordPair(number, serverId) {
  const token = process.env.LEDGER_TOKEN;
  if (!token) return false;
  const apiBase = `https://api.github.com/repos/${REPO}/contents/${LEDGER_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vexora-pair-relay'
  };
  try {
    const cur = await fetch(apiBase, { headers, signal: AbortSignal.timeout(8000) });
    if (!cur.ok) return false;
    const curJson = await cur.json();
    const ledger = JSON.parse(Buffer.from(curJson.content, 'base64').toString('utf8'));
    ledger.pairs = ledger.pairs || {};
    if (!ledger.pairs[number]) {
      ledger.pairs[number] = { server: serverId, at: new Date().toISOString() };
      const body = {
        message: `ledger: pair ${number} on server ${serverId}`,
        content: Buffer.from(JSON.stringify(ledger, null, 2)).toString('base64'),
        sha: curJson.sha
      };
      const put = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000)
      });
      return put.ok;
    }
    return true; // already recorded (re-pair)
  } catch (_) {
    return false;
  }
}

module.exports = { SERVERS, readLedger, serverStats, recordPair };
