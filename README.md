# VEXORA PAIR

Pairing (Link Device) website for the **VEXORA SMD** WhatsApp bot.

- `index.html` — the pairing page. Users come here only to pair:
  they enter their WhatsApp number and get a pairing code.
- `api/code.js` — a tiny relay. A pairing code can only be created
  by the bot process itself (it opens the WhatsApp socket and stores
  the new session), so this function forwards the request to the
  bot's own pairing endpoint on Railway and returns its answer.

Sessions and everything else stay on the bot's side (Railway) —
this site is only the face.

If the bot's Railway domain changes, update `BOT_BASE` in
`api/code.js` — nothing else needs to change.
