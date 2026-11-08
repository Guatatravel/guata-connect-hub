import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { userCanManageOrgWhatsApp } from "@/lib/organizations.server";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export const GRAPH = "https://graph.facebook.com/v21.0";
export const OAUTH_COOKIE = "guata-instagram-oauth";
export type InstagramAccount = { id: string; pageId: string; name: string; token: string };

export async function bindOAuthBrowser(state: string, secret: string, secure: boolean) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(state));
  const value = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
  setCookie(OAUTH_COOKIE, value, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
}

export async function verifyOAuthBrowser(state: string, secret: string) {
  const value = getCookie(OAUTH_COOKIE);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], b => parseInt(b, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(state));
}

export async function graphGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${GRAPH}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Não foi possível autorizar o Instagram. Confira as permissões e a aprovação do aplicativo na Meta.");
  return response.json() as Promise<T>;
}

export async function claimOAuthAttempt(id: string) {
  const { data: existing } = await supabaseAdmin.from("instagram_oauth_attempts").select("user_id,organization_id,expires_at").eq("id", id).maybeSingle();
  if (!existing || Date.parse(existing.expires_at) <= Date.now() || !(await userCanManageOrgWhatsApp(existing.user_id, existing.organization_id))) return null;
  const { data } = await supabaseAdmin.from("instagram_oauth_attempts").update({ status: "processing" }).eq("id", id).eq("status", "awaiting").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  return data;
}