export const INSTAGRAM_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_metadata",
  "instagram_basic", "instagram_manage_comments", "instagram_manage_messages",
];

export function validOAuthAttempt(attempt: { user_id: string; organization_id: string; expires_at: string }, userId: string, orgId: string, now = Date.now()) {
  return attempt.user_id === userId && attempt.organization_id === orgId && Date.parse(attempt.expires_at) > now;
}

export function publicInstagramAccounts(accounts: Array<{ id: string; pageId: string; name: string; token?: string }>) {
  return accounts.map(({ id, pageId, name }) => ({ id, pageId, name }));
}