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

module.exports = { loadServers, cleanUrl, safeServerUrl, findServer, DATA_PATH };
