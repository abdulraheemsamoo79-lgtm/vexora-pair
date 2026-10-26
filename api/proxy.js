// VEXORA pairing portal — proxy (Vercel serverless port of api/proxy.php).
// GET /api/proxy?server=<id>&action=active
// GET /api/proxy?server=<id>&action=code&number=<number>
//
// Behaviour matches the PHP original exactly: 'active' tries the
// target bot server's /active-style endpoints and passes the JSON
// through with the configured limit; if no count endpoint exists it
// falls back to a reachability check. 'code' enforces the server's
// user limit when a live count is available, then relays the target's
// /api/code response. The portal never creates pairing codes itself.

const { loadServers, findServer, cleanUrl, safeServerUrl } = require('../lib/store');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function requestJson(url, timeoutMs) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { Accept: 'application/json', 'User-Agent': 'VEXORA-Pairing-Portal/1.2' }
    });
    clearTimeout(t);
    const body = await r.text();
    return { body, errno: 0, error: '', status: r.status };
  } catch (e) {
    return { body: false, errno: 1, error: e.message, status: 0 };
  }
}

function extractCount(data, bodyText) {
  if (data && typeof data === 'object') {
    const list = Array.isArray(data.users) ? data.users
      : Array.isArray(data.activeUsers) ? data.activeUsers
      : Array.isArray(data.numbers) ? data.numbers : null;
    let raw = data.count ?? data.activeCount ?? data.totalActive ?? data.onlineCount ?? data.usersCount ?? null;
    if (raw === null && (typeof data.active === 'number' || (typeof data.active === 'string' && /^\d+$/.test(data.active)))) raw = data.active;
    if (raw === null && list !== null) raw = list.length;
    if (raw !== null && typeof raw === 'object') raw = raw.count ?? raw.total ?? raw.length ?? null;
    if (raw !== null && raw !== '' && isFinite(Number(raw))) return Math.max(0, Number(raw));
    return null;
  }
  const plain = String(bodyText || '').trim();
  if (/^\d+$/.test(plain)) return parseInt(plain, 10);
  return null;
}

const ACTIVE_PATHS = (base, serverId) => [
  `${base}/active`,
  `${base}/active?server=${encodeURIComponent(serverId)}`,
  `${base}/api/active`,
  `${base}/api/active?server=${encodeURIComponent(serverId)}`,
  `${base}/status`,
  `${base}/api/status`
];

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const serverId = String(searchParams.get('server') || '').trim();
  const action = String(searchParams.get('action') || 'active').trim();
  const servers = loadServers();
  const server = findServer(servers, serverId);

  if (!server) return sendJson(res, 404, { error: 'Server not found' });

  const base = cleanUrl(String(server.url || ''));
  let serverLimit = parseInt(server.limit ?? 50, 10);
  if (!serverLimit || serverLimit < 1) serverLimit = 50;
  if (!safeServerUrl(base)) return sendJson(res, 400, { error: 'Invalid server URL' });

  if (action === 'active') {
    for (const target of ACTIVE_PATHS(base, serverId)) {
      const { body, errno, status } = await requestJson(target, 12000);
      if (errno || body === false || status < 200 || status >= 300) continue;
      let data = null;
      try { data = JSON.parse(body); } catch (_) {}
      if (data && typeof data === 'object') {
        data.limit = serverLimit;
        return sendJson(res, 200, data);
      }
      const plain = String(body).trim();
      if (/^\d+$/.test(plain)) {
        return sendJson(res, 200, { count: parseInt(plain, 10), limit: serverLimit, online: true });
      }
    }
    const reach = await requestJson(base, 10000);
    if (!reach.errno && reach.status >= 200 && reach.status < 500) {
      return sendJson(res, 200, {
        online: true,
        count: null,
        limit: serverLimit,
        status: 'online',
        message: 'Server reachable, but no active-user count endpoint was exposed.'
      });
    }
    return sendJson(res, 502, { error: 'Target server is unreachable' });
  }

  if (action === 'code') {
    const number = String(searchParams.get('number') || '').replace(/\D+/g, '');
    if (number.length < 10 || number.length > 15) {
      return sendJson(res, 422, { error: 'Invalid phone number' });
    }
    // Enforce the configured limit before generating a new code.
    for (const target of ACTIVE_PATHS(base, serverId)) {
      const { body, errno, status } = await requestJson(target, 10000);
      if (errno || body === false || status < 200 || status >= 300) continue;
      let data = null;
      try { data = JSON.parse(body); } catch (_) {}
      const activeCount = extractCount(data, body);
      if (activeCount !== null) {
        if (activeCount >= serverLimit) {
          return sendJson(res, 429, { error: 'Server user limit reached', count: activeCount, limit: serverLimit });
        }
        break;
      }
    }
    const target = `${base}/api/code?number=${encodeURIComponent(number)}`;
    const { body, errno, status } = await requestJson(target, 45000);
    if (errno || body === false) return sendJson(res, 502, { error: 'Target server is unreachable' });
    let data = null;
    try { data = JSON.parse(body); } catch (_) {}
    const outStatus = status >= 200 && status < 600 ? status : 502;
    if (data && typeof data === 'object') return sendJson(res, outStatus, data);
    return sendJson(res, outStatus, { error: 'Target returned an invalid response' });
  }

  return sendJson(res, 400, { error: 'Unknown action' });
};
