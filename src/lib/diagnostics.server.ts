/**
 * Diagnóstico server-only das integrações (Descubra MS, webhook, Meta).
 * Nunca devolve credenciais — apenas status, contagens e amostras curtas.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getDescubraAdminClient,
  isDescubraConfigured,
  getGuataPersona,
} from "@/integrations/descubra/admin.server";
import { isMetaConfigured } from "@/lib/meta-send.server";

export type CheckState = "ok" | "warn" | "fail";

export interface DiagnosticCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  hint?: string;
}

export async function requireStaffUser(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data || data.length === 0) throw new Error("Acesso restrito à equipe.");
  return data.map((r) => r.role as string);
}

export async function requireAdminUser(userId: string) {
  const roles = await requireStaffUser(userId);
  if (!roles.includes("admin")) throw new Error("Apenas administradores.");
}

async function countTable(
  table: string,
): Promise<{ count: number | null; error: string | null }> {
  const client = getDescubraAdminClient();
  if (!client) return { count: null, error: "sem credenciais" };
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  return { count: count ?? null, error: error ? error.message : null };
}

export async function runDiagnostics(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // 1. Credenciais do Descubra
  if (!isDescubraConfigured()) {
    checks.push({
      id: "credenciais",
      label: "Credenciais do Descubra MS",
      state: "fail",
      detail: "URL e/ou chave de serviço não configuradas.",
      hint: "Peça para configurar os secrets DESCUBRA_SUPABASE_URL e DESCUBRA_SUPABASE_SERVICE_ROLE_KEY.",
    });
  } else {
    checks.push({
      id: "credenciais",
      label: "Credenciais do Descubra MS",
      state: "ok",
      detail: "Chaves presentes no servidor.",
    });

    // 2. Base de conhecimento
    const kb = await countTable("guata_knowledge_base");
    checks.push({
      id: "kb",
      label: "Base de conhecimento do Guatá",
      state: kb.error ? "fail" : (kb.count ?? 0) > 0 ? "ok" : "warn",
      detail: kb.error
        ? `Falha ao ler: ${kb.error}`
        : `${kb.count ?? 0} pergunta(s)/resposta(s) encontradas.`,
      hint: kb.error
        ? "Verifique se a chave de serviço é do projeto certo e se a tabela guata_knowledge_base existe."
        : (kb.count ?? 0) === 0
          ? "A conexão funciona, mas ainda não há conteúdo cadastrado no admin do Descubra."
          : undefined,
    });

    // 3. Eventos
    let eventos: { count: number | null; error: string | null } = {
      count: null,
      error: "tabela não encontrada",
    };
    for (const t of ["events_public", "events"]) {
      const r = await countTable(t);
      if (!r.error) {
        eventos = r;
        break;
      }
      eventos = r;
    }
    checks.push({
      id: "eventos",
      label: "Eventos do Descubra MS",
      state: eventos.error ? "fail" : (eventos.count ?? 0) > 0 ? "ok" : "warn",
      detail: eventos.error
        ? `Falha ao ler: ${eventos.error}`
        : `${eventos.count ?? 0} evento(s) visíveis para o Guatá.`,
      hint: eventos.error
        ? "Confirme o nome da tabela de eventos no Descubra (events_public ou events)."
        : undefined,
    });

    // 4. Persona
    let persona: string | null = null;
    let personaErr: string | null = null;
    try {
      persona = await getGuataPersona();
    } catch (e) {
      personaErr = e instanceof Error ? e.message : "erro desconhecido";
    }
    checks.push({
      id: "persona",
      label: "Persona / prompt do Guatá",
      state: personaErr ? "fail" : persona ? "ok" : "warn",
      detail: personaErr
        ? `Falha ao ler: ${personaErr}`
        : persona
          ? `"${persona.slice(0, 120)}${persona.length > 120 ? "…" : ""}"`
          : "Nenhum prompt encontrado em ai_prompt_configs (chatbot_name = guata).",
      hint:
        !personaErr && !persona
          ? "O bot usa a persona local do painel enquanto não houver prompt no Descubra."
          : undefined,
    });
  }

  // 5. Webhook de eventos
  const secretOk = Boolean(process.env.DESCUBRA_WEBHOOK_SECRET);
  const { data: lastPost } = await supabaseAdmin
    .from("channel_posts")
    .select("title, created_at")
    .eq("source", "descubra-ms")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  checks.push({
    id: "webhook",
    label: "Webhook de eventos (Descubra → Canal)",
    state: !secretOk ? "fail" : lastPost ? "ok" : "warn",
    detail: !secretOk
      ? "Secret DESCUBRA_WEBHOOK_SECRET ausente."
      : lastPost
        ? `Último evento recebido: "${lastPost.title}" em ${new Date(
            lastPost.created_at as string,
          ).toLocaleString("pt-BR")}.`
        : "Nunca recebemos um evento do Descubra MS.",
    hint:
      secretOk && !lastPost
        ? "Crie o Database Webhook no Supabase do Descubra apontando para a URL acima, ou use o botão “Enviar evento de teste”."
        : undefined,
  });

  // 6. WhatsApp (Meta)
  const { data: lastMsg } = await supabaseAdmin
    .from("messages")
    .select("created_at")
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const metaOk = isMetaConfigured("descubra");
  checks.push({
    id: "meta",
    label: "WhatsApp Business (Meta)",
    state: !metaOk ? "fail" : lastMsg ? "ok" : "warn",
    detail: !metaOk
      ? "Token de acesso ou número da linha Descubra não configurado."
      : lastMsg
        ? `Última mensagem recebida em ${new Date(
            lastMsg.created_at as string,
          ).toLocaleString("pt-BR")}.`
        : "Credenciais ok, mas nenhuma mensagem chegou ainda.",
    hint:
      metaOk && !lastMsg
        ? "Confirme no Meta Developers que a Callback URL está verificada e que o campo “messages” está subscrito."
        : undefined,
  });

  return checks;
}

const STABLE_PUBLIC_URL =
  "https://project--16a8412a-83f5-4d18-bc70-414943f20be8.lovable.app";

export async function sendTestEvent(): Promise<{
  ok: boolean;
  message: string;
}> {
  const secret = process.env.DESCUBRA_WEBHOOK_SECRET;
  if (!secret) {
    return {
      ok: false,
      message: "Secret DESCUBRA_WEBHOOK_SECRET não configurado.",
    };
  }
  const payload = {
    type: "INSERT",
    table: "events",
    record: {
      id: `teste-${Date.now()}`,
      title: "[TESTE] Evento de diagnóstico",
      description:
        "Post gerado pelo botão de teste das Configurações. Pode arquivar depois.",
      city: "Campo Grande",
      starts_at: new Date().toISOString(),
    },
  };
  try {
    const res = await fetch(
      `${STABLE_PUBLIC_URL}/api/public/webhooks/descubra-ms`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        message: `O webhook respondeu ${res.status}. Publique o app e tente de novo.`,
      };
    }
    return {
      ok: true,
      message: "Evento de teste criado — confira a aba Canal.",
    };
  } catch (e) {
    return {
      ok: false,
      message: `Não foi possível chamar o webhook: ${
        e instanceof Error ? e.message : "erro de rede"
      }`,
    };
  }
}
