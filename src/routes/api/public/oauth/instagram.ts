import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/oauth/instagram")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const state = z.string().uuid().safeParse(url.searchParams.get("state"));
    const secret = process.env['INSTAGRAM_OAUTH_SESSION_SECRET'];
    const appId = process.env['META_APP_ID'];
    const appSecret = process.env['META_APP_SECRET'];
    if (!state.success || !secret || !appId || !appSecret) return new Response("Conexão inválida ou não configurada.", { status: 400 });
    const { verifyOAuthBrowser, claimOAuthAttempt, graphGet } = await import("@/lib/instagram-oauth.server");
    if (!(await verifyOAuthBrowser(state.data, secret)) || !(await claimOAuthAttempt(state.data))) return new Response("Conexão expirada. Volte ao painel e tente novamente.", { status: 400 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const code = z.string().min(1).max(4096).parse(url.searchParams.get("code"));
      const short = await graphGet<{ access_token: string }>(`oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: `${url.origin}/api/public/oauth/instagram`, code })}`);
      const long = await graphGet<{ access_token: string }>(`oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token })}`);
      const permissions = await graphGet<{ data: Array<{ permission: string; status: string }> }>("me/permissions", long.access_token);
      const required = ["pages_show_list", "pages_manage_metadata", "instagram_basic", "instagram_manage_comments", "instagram_manage_messages"];
      if (required.some(p => !permissions.data.some(grant => grant.permission === p && grant.status === "granted"))) throw new Error("Permissões insuficientes");
      const pages = await graphGet<{ data: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string } }> }>("me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100", long.access_token);
      const accounts = pages.data.flatMap(page => page.access_token && page.instagram_business_account ? [{ id: page.instagram_business_account.id, pageId: page.id, name: page.instagram_business_account.username ? `@${page.instagram_business_account.username} · ${page.name}` : page.name, token: page.access_token }] : []);
      if (!accounts.length) throw new Error("Nenhuma conta elegível");
      await supabaseAdmin.from("instagram_oauth_attempts").update({ status: "ready", accounts }).eq("id", state.data);
    } catch {
      await supabaseAdmin.from("instagram_oauth_attempts").update({ status: "error", accounts: [] }).eq("id", state.data);
    }
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conexão Instagram — Guatá Channel</title><p>Autorização recebida. Volte ao Guatá Channel para concluir a conexão.</p><a href="/instagram">Voltar ao painel</a><script>if(window.opener){window.close()}</script></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
  } } },
});