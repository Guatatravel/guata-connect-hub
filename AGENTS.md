# AGENTS.md

- WhatsApp knowledge media/links are sent only when the AI tags them ([[ENVIAR_PDF/MIDIA:id]]) or the client asks and names a specific keyword — keyword-only auto-send caused off-topic files.
- Triage sidebar badge counts travel_intake rows with staff_seen_at null; opening Triagens marks them seen — keeps the badge from getting stuck.
- The panel shows a single official WhatsApp line per organization (line "descubra"); the "viagens" line is legacy — avoids duplicated channels in the UI.
- WhatsApp Embedded Signup (coexistence) exchanges the Meta code only on the server and stores the business token on whatsapp_channels line "descubra"; sending uses that saved token and phone id, and Guatá env secrets are only the fallback when the line has none — keeps META_APP_SECRET, the token and the number away from other members, and stops a deleted direct-API number from overriding coexistence.
- Passhub credentials are stored per product (api_key_aereo/hotel/seguro/rodoviario) in passhub_settings, readable only by server code; the legacy single api_key column is deprecated — Passhub issues a separate key per module.
- Account deletion and WhatsApp disconnect live in src/lib/account.server.ts; platform admins and the official Guatá org are never deleted there — prevents locking out the platform owner.
- Unit tests use bun:test and are excluded from tsconfig — vitest is not installed.
- AI replies use the agency's own Lovable key when Configurações saves one; otherwise they share Guatá's key. Lovable includes 4 AI credits a month for the whole app, then general credits, so there is no invented reply cap unless Guatá sets one. The reply counter resets on day 10 (America/Cuiaba). The key stays server-side.
- Instagram is only a lead bridge: comments trigger a public reply + Direct with a wa.me link; selling stays on WhatsApp. Settings/token live in instagram_settings (server-only) — keeps one sales channel and the token off the browser.
- Instagram Facebook OAuth uses a signed HTTP-only browser cookie plus short-lived, single-use database attempts bound to user and organization; only credential-free account metadata reaches the UI — prevents CSRF, replay and cross-agency token exposure.
