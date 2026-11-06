/**
 * Ponte Instagram → WhatsApp (server-only).
 * Comentário com palavra-chave → resposta pública curta + Direct com convite para o WhatsApp.
 * O token do Instagram nunca sai do servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export type IgSettings = {
  organization_id: string;
  enabled: boolean;
  ig_account_id: string | null;
  access_token: string | null;
  whatsapp_number: string | null;
  keywords: string[];
  reply_any_question: boolean;
  comment_replies: string[];
  dm_extra: string | null;
};

export async function loadIgSettings(orgId: string): Promise<IgSettings | null> {
  const { data } = await supabaseAdmin
    .from("instagram_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as IgSettings | null) ?? null;
}

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Decide se um comentário deve disparar a ponte. */
export function shouldTrigger(text: string, keywords: string[], anyQuestion: boolean): boolean {
  const t = normalize(text);
  if (keywords.some((k) => k.trim() && t.includes(normalize(k.trim())))) return true;
  return anyQuestion && t.includes("?");
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

async function graphPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Instagram [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function writeDm(commentText: string, username: string, extra: string | null): Promise<string> {
  const { chatCompletion } = await import("@/lib/ai-gateway.server");
  try {
    const out = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Você é o Guatá, anfitrião de viagens com raiz no Mato Grosso do Sul. Escreva uma mensagem de Direct do Instagram, curta (máx. 4 linhas), calorosa, no idioma do comentário, sem markdown e sem asteriscos. Reconheça o interesse, cite 1 ou 2 destaques reais do destino se ele aparecer, nunca invente preços nem prometa arquivos, e termine convidando para continuar no WhatsApp (o link será adicionado depois, não escreva link)." +
            (extra ? `\nInstrução da agência: ${extra}` : ""),
        },
        { role: "user", content: `Comentário de @${username}: "${commentText}"` },
      ],
      { maxTokens: 220, temperature: 0.7 },
    );
    if (out) return out;
  } catch {
    /* fallback abaixo */
  }
  return `Oi @${username}! Que bom ver seu interesse 💚 Vamos continuar pelo WhatsApp que lá eu monto tudo certinho pra você.`;
}

/** Processa um comentário recebido pelo webhook. */
export async function handleIgComment(input: {
  igAccountId: string;
  commentId: string;
  mediaId: string | null;
  text: string;
  username: string;
  fromId: string | null;
}): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("instagram_settings")
    .select("*")
    .eq("ig_account_id", input.igAccountId)
    .maybeSingle();
  const s = row as IgSettings | null;
  // Nunca responder a si mesmo
  if (!s || input.fromId === s.ig_account_id) return;

  const { error: dupErr } = await supabaseAdmin.from("instagram_events").insert({
    organization_id: s.organization_id,
    comment_id: input.commentId,
    media_id: input.mediaId,
    username: input.username,
    text: input.text.slice(0, 1000),
  });
  if (dupErr) return; // já processado

  const mark = (status: string, error?: string) =>
    supabaseAdmin
      .from("instagram_events")
      .update({ status, error: error ?? null })
      .eq("comment_id", input.commentId);

  if (!s.enabled || !s.access_token || !s.whatsapp_number) return void (await mark("ignorado", "Ponte desligada ou incompleta"));
  if (!shouldTrigger(input.text, s.keywords, s.reply_any_question)) return void (await mark("ignorado"));

  try {
    const replies = s.comment_replies.filter((r) => r.trim());
    const reply = (replies[Math.floor(Math.random() * replies.length)] ?? "Te chamei no Direct, @{nome}!").replaceAll(
      "{nome}",
      input.username,
    );
    await graphPost(`/${input.commentId}/replies`, s.access_token, { message: reply });

    const dm = await writeDm(input.text, input.username, s.dm_extra);
    const link = whatsappLink(s.whatsapp_number, `Olá! Vim pelo Instagram: "${input.text.slice(0, 120)}"`);
    await graphPost(`/${s.ig_account_id}/messages`, s.access_token, {
      recipient: { comment_id: input.commentId },
      message: { text: `${dm}\n\n👉 ${link}` },
    });
    await mark("respondido");
  } catch (e) {
    await mark("erro", e instanceof Error ? e.message : String(e));
  }
}
