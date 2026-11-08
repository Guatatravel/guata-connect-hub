import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { INSTAGRAM_SCOPES, publicInstagramAccounts, validOAuthAttempt } from "./instagram-oauth-rules";

export const startInstagramOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requireActiveOrganization } = await import("./auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("./organizations.server");
    const { bindOAuthBrowser } = await import("./instagram-oauth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) throw new Error("Apenas o dono ou administrador pode conectar o Instagram.");
    const appId = process.env['META_APP_ID'];
    const appSecret = process.env['META_APP_SECRET'];
    const sessionSecret = process.env['INSTAGRAM_OAUTH_SESSION_SECRET'];
    if (!appId || !appSecret || !sessionSecret) throw new Error("A conexão pelo Facebook aguarda a configuração do aplicativo Meta.");
    const origin = new URL(getRequest().url).origin;
    const id = crypto.randomUUID();
    // Clear expired credentials and prior attempts from this user, without touching active integrations.
    await supabaseAdmin.from("instagram_oauth_attempts").delete().lt("expires_at", new Date().toISOString());
    await supabaseAdmin.from("instagram_oauth_attempts").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin.from("instagram_oauth_attempts").insert({ id, user_id: context.userId, organization_id: orgId, expires_at: new Date(Date.now() + 600000).toISOString() });
    if (error) throw new Error("Não foi possível iniciar a conexão.");
    await bindOAuthBrowser(id, sessionSecret, origin.startsWith("https://"));
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.search = new URLSearchParams({ client_id: appId, redirect_uri: `${origin}/api/public/oauth/instagram`, state: id, response_type: "code", scope: INSTAGRAM_SCOPES.join(","), auth_type: "rerequest" }).toString();
    return { id, url: url.toString() };
  });

export const fetchInstagramOAuthResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { requireActiveOrganization } = await import("./auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("./organizations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) throw new Error("Sem permissão para conectar o Instagram.");
    const { data: attempt } = await supabaseAdmin.from("instagram_oauth_attempts").select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!attempt || !validOAuthAttempt(attempt, context.userId, orgId)) throw new Error("A conexão expirou. Clique em conectar novamente.");
    const accounts = attempt.accounts as unknown as Array<{ id: string; pageId: string; name: string }>;
    return { status: attempt.status, accounts: publicInstagramAccounts(accounts) };
  });

export const finishInstagramOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), accountId: z.string().regex(/^\d+$/).max(60) }).parse(input))
  .handler(async ({ context, data }) => {
    const { requireActiveOrganization } = await import("./auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("./organizations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { GRAPH } = await import("./instagram-oauth.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) throw new Error("Sem permissão para conectar o Instagram.");
    // Atomic consume: two tabs cannot apply the same credential selection.
    const { data: attempt } = await supabaseAdmin.from("instagram_oauth_attempts").delete().eq("id", data.id).eq("user_id", context.userId).eq("organization_id", orgId).eq("status", "ready").gt("expires_at", new Date().toISOString()).select("accounts").maybeSingle();
    const accounts = (attempt?.accounts ?? []) as unknown as Array<{ id: string; pageId: string; name: string; token: string }>;
    const account = accounts.find(a => a.id === data.accountId);
    if (!account) throw new Error("Conta indisponível. Conecte pelo Facebook novamente.");
    const subscription = await fetch(`${GRAPH}/${account.pageId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ subscribed_fields: "feed" }), signal: AbortSignal.timeout(20000) });
    if (!subscription.ok) throw new Error("A Meta não autorizou os avisos desta Página. Confira a permissão pages_manage_metadata e tente novamente.");
    const { data: duplicate } = await supabaseAdmin.from("instagram_settings").select("organization_id").eq("ig_account_id", account.id).neq("organization_id", orgId).maybeSingle();
    if (duplicate) throw new Error("Este Instagram já está vinculado a outra agência.");
    const { error } = await supabaseAdmin.from("instagram_settings").upsert({ organization_id: orgId, ig_account_id: account.id, access_token: account.token, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
    if (error) throw new Error("Não foi possível salvar a conexão do Instagram.");
    return { accountId: account.id, name: account.name };
  });