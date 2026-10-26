// VEXORA pairing portal — admin API (Vercel serverless port of admin.php).
//
// Login uses the ADMIN_USER / ADMIN_PASS environment variables
// (Vercel → project → Settings → Environment Variables) and sets a
// signed httpOnly cookie. Server changes are saved by committing
// data/servers.json back to this repo through the GitHub API, which
// needs LEDGER_TOKEN (a fine-grained GitHub token with Contents
// read/write on this repo only). Saving triggers a redeploy, so
// changes go live in under a minute. Without LEDGER_TOKEN the panel
// still opens in read-only mode and saves return a clear error.

const crypto = require('crypto');
const { loadServers, cleanUrl, safeServerUrl } = require('../lib/store');

const REPO = 'abdulraheemsamoo79-lgtm/vexora-pair';
const FILE = 'data/servers.json';

function sendJson(res, code, obj, extraHeaders) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(JSON.stringify(obj));
}

function adminUser() { return process.env.ADMIN_USER || 'admin'; }
function adminPass() { return process.env.ADMIN_PASS || ''; }
function authToken() {
  return crypto.createHmac('sha256', adminPass()).update(adminUser()).digest('hex');
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
  if (!adminPass()) return false;
  const c = parseCookies(req).vx_admin || '';
  const expected = authToken();
  try {
    return c.length === expected.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected));
  } catch (_) { return false; }
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (d) => { raw += d; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function ghLoadServers(token) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vexora-pair-admin' },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('GitHub read failed (' + r.status + ')');
  const j = await r.json();
  const parsed = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  return { servers: Array.isArray(parsed) ? parsed : [], sha: j.sha };
}
async function ghSaveServers(token, servers, sha, message) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vexora-pair-admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(servers, null, 2) + '\n').toString('base64'),
      sha
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('GitHub write failed (' + r.status + ')');
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const action = String(body.action || searchParams.get('action') || '').trim();
  const token = process.env.LEDGER_TOKEN || '';

  if (action === 'me') {
    return sendJson(res, 200, {
      loggedIn: isAuthed(req),
      storage: !!token,
      configured: !!adminPass(),
      servers: isAuthed(req) ? loadServers() : undefined
    });
  }

  if (action === 'login') {
    if (!adminPass()) {
      return sendJson(res, 503, { error: 'Admin password is not configured. Set ADMIN_PASS in Vercel → Settings → Environment Variables, then redeploy.' });
    }
    const u = String(body.username || '');
    const p = String(body.password || '');
    const safeEq = (a, b) => {
      const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
      return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
    };
    if (!safeEq(u, adminUser()) || !safeEq(p, adminPass())) {
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
    if (!token) return sendJson(res, 503, { error: 'Storage is not configured. Set LEDGER_TOKEN in Vercel → Settings → Environment Variables, then redeploy.' });
    try {
      const { servers, sha } = await ghLoadServers(token);
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
        await ghSaveServers(token, servers, sha, `admin: save server ${id}`);
        return sendJson(res, 200, { ok: true, message: 'Server saved successfully.', servers });
      }
      const id = String(body.id || '');
      const next = servers.filter((s) => (s.id || '') !== id);
      await ghSaveServers(token, next, sha, `admin: delete server ${id}`);
      return sendJson(res, 200, { ok: true, message: 'Server removed.', servers: next });
    } catch (e) {
      return sendJson(res, 502, { error: 'Save failed: ' + e.message });
    }
  }

  return sendJson(res, 400, { error: 'Unknown action' });
};
