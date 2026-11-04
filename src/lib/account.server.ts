/**
 * Desconectar WhatsApp da agência e excluir a conta do usuário — server-only.
 * A conta Meta/Facebook e o número continuam do cliente: aqui só removemos o
 * vínculo com o Guatá Channel (assinatura do app + credenciais guardadas).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function unsubscribeMetaApp(wabaId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type DisconnectResult = { channels: number; metaUnsubscribed: number };

/** Para de receber/enviar pela Meta e apaga tokens e identificadores salvos. */
export async function disconnectOrganizationWhatsApp(organizationId: string): Promise<DisconnectResult> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("is_guata")
    .eq("id", organizationId)
    .maybeSingle();
  if (org?.is_guata) {
    throw new Error("A linha oficial do Guatá é gerida pela plataforma e não pode ser desconectada por aqui.");
  }
  const { data: channels, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("id, waba_id, access_token")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);

  let metaUnsubscribed = 0;
  for (const c of channels ?? []) {
    if (c.waba_id && c.access_token && (await unsubscribeMetaApp(c.waba_id, c.access_token))) {
      metaUnsubscribed += 1;
    }
  }
  if ((channels ?? []).length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("whatsapp_channels")
      .update({
        access_token: null,
        phone_number_id: null,
        waba_id: null,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);
    if (upErr) throw new Error(upErr.message);
  }
  await supabaseAdmin
    .from("passhub_settings")
    .update({
      enabled: false,
      api_key: null,
      api_key_aereo: null,
      api_key_hotel: null,
      api_key_seguro: null,
      api_key_rodoviario: null,
    })
    .eq("organization_id", organizationId);
  return { channels: (channels ?? []).length, metaUnsubscribed };
}

/**
 * Exclui a conta do usuário. Agências em que ele é o único dono são apagadas
 * junto (conversas, base, canais) depois de desconectar a Meta. Admins da
 * plataforma e a agência oficial Guatá nunca são apagados por aqui.
 */
export async function deleteUserAccount(userId: string): Promise<{ deletedOrganizations: number }> {
  const { data: adminRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRole) {
    throw new Error("Conta de administrador da plataforma não pode ser excluída por aqui.");
  }

  const { data: memberships, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, organizations(is_guata)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const toDelete: string[] = [];
  for (const m of memberships ?? []) {
    const isGuata = Boolean((m.organizations as { is_guata?: boolean } | null)?.is_guata);
    if (isGuata || m.role !== "owner") continue;
    const { count } = await supabaseAdmin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", m.organization_id)
      .eq("role", "owner")
      .neq("user_id", userId);
    if (!count) toDelete.push(m.organization_id);
  }

  for (const orgId of toDelete) {
    await disconnectOrganizationWhatsApp(orgId);
    const { error: delErr } = await supabaseAdmin.from("organizations").delete().eq("id", orgId);
    if (delErr) throw new Error(`Não foi possível apagar a agência: ${delErr.message}`);
  }

  await supabaseAdmin.from("organization_members").delete().eq("user_id", userId);
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) throw new Error(authErr.message);
  return { deletedOrganizations: toDelete.length };
}
