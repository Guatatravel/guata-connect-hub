# Instagram connection via Facebook

## One-time Meta app setup

- Configure Facebook Login for Business on the same app used by the signed Instagram webhook.
- Set `META_APP_ID` to that app's ID. The existing `META_APP_SECRET` must belong to the same app; do not replace WhatsApp tokens.
- Register this exact valid OAuth redirect URI: `https://guata-connect-hub.lovable.app/api/public/oauth/instagram`.
- Add `guata-connect-hub.lovable.app` to app domains and enable Web OAuth Login and Client OAuth Login.
- For a preview test, explicitly allow its own HTTPS origin with the same callback path; do not use wildcard redirects.
- Request appropriate access for `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_comments` and `instagram_manage_messages`. App Review for external customers is separate from WhatsApp coexistence approval.
- Configure the Instagram webhook callback `https://guata-connect-hub.lovable.app/api/public/webhooks/instagram`, existing verification token, and the Instagram `comments` subscription. App-level subscription must be configured in Meta, not inferred from successful OAuth.

## Agency connection

An authorized owner/admin opens Instagram, connects through Facebook, consents to the requested permissions and selects a discovered professional Instagram linked to a Page. The server stores the Page credential against that agency only, preserving existing bridge settings and activation state. Set the destination WhatsApp and save; enable the bridge only after a real comment/private-reply test.

Credentials are not permanent guarantees: Meta can expire/revoke them when permissions, account passwords or app access change. Reconnect through Facebook when authorization fails. Account discovery is limited to the first 100 Pages returned by Meta.

OAuth state expires in ten minutes, is tied to a signed HTTP-only browser cookie and the authenticated initiating user/organization, and is atomically consumed. Tokens remain in service-only tables and temporary credentials are removed on completion, next connection or expiry cleanup. No OAuth callback changes WhatsApp configuration.