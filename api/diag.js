// TEMPORARY diagnostic for KV storage behaviour. Remove after use.
module.exports = async (req, res) => {
  const base = process.env.KV_REST_API_URL || '';
  const tok = process.env.KV_REST_API_TOKEN || '';
  const out = { hasUrl: !!base, hasToken: !!tok };
  async function call(path, opts) {
    try {
      const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000), ...(opts || {}) });
      const t = await r.text();
      return { status: r.status, body: t.slice(0, 300) };
    } catch (e) { return { error: e.message }; }
  }
  out.setPath = await call('/set/diagkey', { method: 'POST', body: 'hello123' });
  out.getPath = await call('/get/diagkey');
  out.getServers = await call('/get/servers');
  out.postArray = await call('/', { method: 'POST', body: JSON.stringify(['GET', 'diagkey']) });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(out, null, 1));
};
