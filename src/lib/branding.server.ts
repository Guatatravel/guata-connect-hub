/**
 * Logo personalizada do portal. Arquivo fica no bucket privado "branding";
 * o painel/login recebem uma URL assinada temporária (nunca a chave).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "branding";

async function getSettingsRow() {
  const { data } = await supabaseAdmin
    .from("channel_settings")
    .select("id, logo_url")
    .maybeSingle();
  return data;
}

export async function getLogoUrl(): Promise<string | null> {
  const row = await getSettingsRow();
  const path = row?.logo_url as string | null | undefined;
  if (!path) return null;
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

export async function saveLogo(
  base64: string,
  contentType: string,
): Promise<string | null> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext =
    contentType === "image/svg+xml"
      ? "svg"
      : contentType === "image/jpeg"
        ? "jpg"
        : contentType === "image/webp"
          ? "webp"
          : "png";
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  const row = await getSettingsRow();
  const old = row?.logo_url as string | null | undefined;
  if (row?.id) {
    await supabaseAdmin
      .from("channel_settings")
      .update({ logo_url: path })
      .eq("id", row.id);
  } else {
    await supabaseAdmin.from("channel_settings").insert({ logo_url: path });
  }
  if (old && old !== path) {
    await supabaseAdmin.storage.from(BUCKET).remove([old]);
  }
  return getLogoUrl();
}

export async function clearLogo(): Promise<void> {
  const row = await getSettingsRow();
  const old = row?.logo_url as string | null | undefined;
  if (row?.id) {
    await supabaseAdmin
      .from("channel_settings")
      .update({ logo_url: null })
      .eq("id", row.id);
  }
  if (old) await supabaseAdmin.storage.from(BUCKET).remove([old]);
}
