# VEXORA SMD — Pairing Portal (Vercel Edition)

The pairing portal for the VEXORA SMD WhatsApp bot, converted from
the PHP portal design to run on Vercel serverless hosting.

- **Front page** (`index.html`) — server selector with live active-user
  counts, pairing code generator, animated UI (design preserved from
  the original portal; VEXORA branding applied).
- **Proxy** (`api/proxy.js`) — calls each configured server's
  `/api/active` endpoint for live counts and `/api/code?number=...`
  for pairing, enforcing each server's user limit. The portal never
  creates pairing codes itself.
- **Servers** (`api/servers.js`) — serves the public server list.
- **Admin** (`admin.html` + `api/admin.js`) — login-protected panel to
  add / edit / delete pairing servers. Changes are committed to
  `data/servers.json` in this repo and go live in under a minute.

## Configuration (Vercel → Settings → Environment Variables)

- `ADMIN_USER` — admin username (default: `admin`)
- `ADMIN_PASS` — admin password (**set your own**; login is disabled
  until this is set)
- `LEDGER_TOKEN` — fine-grained GitHub token with **Contents:
  Read and write** on this repo only; required for the admin panel
  to save server changes.

## Servers

Configured in `data/servers.json`:

```json
[
  { "id": "server1", "name": "SERVER 01", "url": "https://vexora-smd.up.railway.app", "limit": 50 }
]
```

A server must expose `GET /api/active` (JSON with a user count) and
`GET /api/code?number=...`, and return JSON.
