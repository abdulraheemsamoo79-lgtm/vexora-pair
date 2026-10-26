// VEXORA pairing portal — admin API (Vercel serverless port of admin.php).
//
// Works like the original: the username/password come from the
// portal config (lib/config.js, the config.php equivalent) and a
// signed httpOnly cookie keeps the session. Server changes are
// saved to the portal's live storage (Vercel KV — the writable
// equivalent of the data/servers.json file on PHP hosting).

const crypto = require('crypto');
const config = require('../lib/config');
const { loadServersLive, saveServersLive, kvConfigured, cleanUrl, safeServerUrl } = require('../lib/store');

function sendJson(res, code, obj, extraHeaders) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(JSON.stringify(obj));
}

function authToken() {
  return crypto.createHmac('sha256', config.ADMIN_PASS).update(config.ADMIN_USER).digest('hex');
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}
function isAuthed(req) {
  const c = parseCookies(req).vx_admin || '';
  const expected = authToken();
  try {
    return c.length === expected.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected));
  } catch (_) { return false; }
}
function safeEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (d) => { raw += d; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const action = String(body.action || searchParams.get('action') || '').trim();

  if (action === 'me') {
    return sendJson(res, 200, {
      loggedIn: isAuthed(req),
      storage: kvConfigured(),
      servers: isAuthed(req) ? await loadServersLive() : undefined
    });
  }

  if (action === 'login') {
    const u = String(body.username || '');
    const p = String(body.password || '');
    if (!safeEq(u, config.ADMIN_USER) || !safeEq(p, config.ADMIN_PASS)) {
      return sendJson(res, 401, { error: 'Invalid username or password.' });
    }
    const cookie = `vx_admin=${authToken()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }

  if (action === 'logout') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'vx_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (action === 'save' || action === 'delete') {
    if (!isAuthed(req)) return sendJson(res, 401, { error: 'Not logged in.' });
    if (!kvConfigured()) return sendJson(res, 503, { error: 'Server storage is not configured.' });
    try {
      const servers = await loadServersLive();
      if (action === 'save') {
        const id = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const name = String(body.name || '').trim();
        const url = cleanUrl(String(body.url || ''));
        let limit = parseInt(body.limit ?? 50, 10);
        if (!limit || limit < 1 || limit > 100000) limit = 50;
        if (!id || !name || !safeServerUrl(url)) {
          return sendJson(res, 422, { error: 'Please enter a valid ID, name and public http/https URL.' });
        }
        const entry = { id, name, url, limit };
        const idx = servers.findIndex((s) => (s.id || '') === id);
        if (idx >= 0) servers[idx] = entry; else servers.push(entry);
        await saveServersLive(servers);
        return sendJson(res, 200, { ok: true, message: 'Server saved successfully.', servers });
      }
      const id = String(body.id || '');
      const next = servers.filter((s) => (s.id || '') !== id);
      await saveServersLive(next);
      return sendJson(res, 200, { ok: true, message: 'Server removed.', servers: next });
    } catch (e) {
      return sendJson(res, 502, { error: 'Save failed: ' + e.message });
    }
  }

  return sendJson(res, 400, { error: 'Unknown action' });
};
