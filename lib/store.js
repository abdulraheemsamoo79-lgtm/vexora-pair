// Shared helpers for the VEXORA pairing portal (Vercel edition).
// Mirrors config.php from the original PHP portal: the server list
// lives in data/servers.json inside this repo. Reads use the copy
// bundled with the current deployment; the admin panel writes
// updates back to the repo through the GitHub API (which triggers
// a redeploy, so changes go live in under a minute).

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'servers.json');

function loadServers() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

// Live storage (Vercel KV). The PHP original read/wrote the JSON
// file on disk; on Vercel the KV store is the writable home for the
// same server list, with the bundled data/servers.json as the
// starting point / fallback.
function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
async function kvRequest(commandPath, body) {
  const r = await fetch(process.env.KV_REST_API_URL + commandPath, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body || undefined,
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('KV ' + r.status);
  return r.json();
}
async function loadServersLive() {
  if (kvConfigured()) {
    try {
      const j = await kvRequest('/get/servers');
      if (j && typeof j.result === 'string' && j.result) {
        const data = JSON.parse(j.result);
        if (Array.isArray(data)) return data;
      }
    } catch (_) { /* fall back to the bundled file */ }
  }
  return loadServers();
}
async function saveServersLive(servers) {
  if (!kvConfigured()) return false;
  await kvRequest('/set/servers', JSON.stringify(servers));
  return true;
}

function cleanUrl(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  return u.replace(/\/+$/, '');
}

function safeServerUrl(url) {
  const u = cleanUrl(url);
  if (!u) return false;
  let parts;
  try { parts = new URL(u); } catch (_) { return false; }
  const host = (parts.hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false;
  }
  return true;
}

function findServer(servers, id) {
  return servers.find((s) => (s.id || '') === id) || null;
}

module.exports = { loadServers, loadServersLive, saveServersLive, kvConfigured, cleanUrl, safeServerUrl, findServer, DATA_PATH };
