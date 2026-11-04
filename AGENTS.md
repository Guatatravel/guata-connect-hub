# AGENTS.md

- WhatsApp knowledge media/links are sent only when the AI tags them ([[ENVIAR_PDF/MIDIA:id]]) or the client asks and names a specific keyword — keyword-only auto-send caused off-topic files.
- Triage sidebar badge counts travel_intake rows with staff_seen_at null; opening Triagens marks them seen — keeps the badge from getting stuck.
- The panel shows a single official WhatsApp line per organization (line "descubra"); the "viagens" line is legacy — avoids duplicated channels in the UI.
- Passhub credentials are stored per product (api_key_aereo/hotel/seguro/rodoviario) in passhub_settings, readable only by server code; the legacy single api_key column is deprecated — Passhub issues a separate key per module.
- Account deletion and WhatsApp disconnect live in src/lib/account.server.ts; platform admins and the official Guatá org are never deleted there — prevents locking out the platform owner.
- Unit tests use bun:test and are excluded from tsconfig — vitest is not installed.
