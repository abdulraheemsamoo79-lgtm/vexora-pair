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

## Configuration

Admin credentials are set with the `ADMIN_USER` / `ADMIN_PASS`
environment variables (Vercel → Settings → Environment Variables)
and read through `lib/config.js`, the `config.php` equivalent.

Server changes made in the admin panel are saved to the project's
Vercel KV store (the writable equivalent of `data/servers.json` on
PHP hosting); the bundled `data/servers.json` is the starting list.

## Servers

Configured in `data/servers.json`:

```json
[
  { "id": "server1", "name": "SERVER 01", "url": "https://vexora-smd.up.railway.app", "limit": 50 }
]
```

A server must expose `GET /api/active` (JSON with a user count) and
`GET /api/code?number=...`, and return JSON.
