/**
 * Dossiê de Fechamento — resumo executivo da conversa gerado pela IA.
 * Server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion } from "@/lib/ai-gateway.server";

export interface Dossie {
  resumo: string;
  interesse: string;
  temperatura: "quente" | "morno" | "frio";
  dados: Record<string, string>;
  objecoes: string[];
  proximo_passo: string;
  mensagem_sugerida: string;
}

export async function generateDossie(sessionId: string): Promise<Dossie | null> {
  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("author, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!msgs || msgs.length === 0) return null;

  const { data: sess } = await supabaseAdmin
    .from("sessions")
    .select("contact_name, intake_data")
    .eq("id", sessionId)
    .maybeSingle();

  const transcript = msgs
    .filter((m) => m.author !== "system")
    .map((m) => `${m.author === "user" ? "Cliente" : m.author === "bot" ? "IA" : "Consultor"}: ${m.text}`)
    .join("\n")
    .slice(-12000);

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          'Você é um analista de vendas de uma agência de turismo. Leia a conversa e devolva APENAS um JSON válido, em português do Brasil, sem markdown, com as chaves: "resumo" (até 3 frases), "interesse" (o que o cliente quer, 1 frase), "temperatura" ("quente"|"morno"|"frio" — chance de fechar), "dados" (objeto com dados coletados como nome, origem, destino, datas, pessoas, orçamento; só o que foi dito), "objecoes" (lista curta de dúvidas/objeções), "proximo_passo" (1 frase de ação para o vendedor), "mensagem_sugerida" (mensagem curta e cordial de WhatsApp para o vendedor enviar e avançar o fechamento). Seja conciso.',
      },
      {
        role: "user",
        content: `Contato: ${sess?.contact_name ?? "desconhecido"}\nDados da triagem: ${JSON.stringify(sess?.intake_data ?? {})}\n\nConversa:\n${transcript}`,
      },
    ],
    { temperature: 0.3 },
  );

  let dossie: Dossie;
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json) as Partial<Dossie>;
    const dados: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.dados ?? {})) {
      if (v !== null && v !== undefined && String(v).trim()) dados[k] = String(v);
    }
    dossie = {
      resumo: String(p.resumo ?? ""),
      interesse: String(p.interesse ?? ""),
      temperatura: (["quente", "morno", "frio"].includes(String(p.temperatura))
        ? p.temperatura
        : "morno") as Dossie["temperatura"],
      dados,
      objecoes: Array.isArray(p.objecoes) ? p.objecoes.map(String) : [],
      proximo_passo: String(p.proximo_passo ?? ""),
      mensagem_sugerida: String(p.mensagem_sugerida ?? ""),
    };
  } catch {
    dossie = {
      resumo: raw.slice(0, 600),
      interesse: "",
      temperatura: "morno",
      dados: {},
      objecoes: [],
      proximo_passo: "",
      mensagem_sugerida: "",
    };
  }

  await supabaseAdmin
    .from("sessions")
    .update({ dossie: dossie as never, dossie_at: new Date().toISOString() } as never)
    .eq("id", sessionId);
  return dossie;
}
