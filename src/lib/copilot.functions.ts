import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  sessionId: z.string().uuid(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(30),
});

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await (context.supabase as unknown as {
      rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: boolean | null }>;
    }).rpc("is_staff", { _uid: context.userId });
    if (!isStaff) throw new Error("Acesso restrito à equipe.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chatCompletion } = await import("@/lib/ai-gateway.server");
    const { assertSessionBelongsToUserOrg } = await import("@/lib/auth-context.server");
    const { quoteValidityForOrg } = await import("@/lib/passhub.server");
    const { quotePromptRules } = await import("@/lib/quote-format");
    const { organizationId } = await assertSessionBelongsToUserOrg(context.userId, data.sessionId);
    const validity = await quoteValidityForOrg(organizationId);
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("author, text")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true })
      .limit(200);
    const transcript = (msgs ?? [])
      .filter((m) => m.author !== "system")
      .map((m) => `${m.author === "user" ? "Cliente" : m.author === "bot" ? "Guatá (IA)" : "Consultor"}: ${m.text}`)
      .join("\n")
      .slice(-10000);

    try {
      const answer = await chatCompletion(
        [
          {
            role: "system",
            content:
              "Você é o Copiloto interno do Guatá, assistente do consultor da agência Guatá. O cliente NÃO vê esta conversa. Ajude o consultor a entender o cliente, sugerir estratégia de venda, traduzir e explicar mensagens em outros idiomas (ex.: inglês), e redigir respostas prontas. Responda em português, de forma objetiva, sem Markdown pesado. Quando sugerir uma mensagem para o cliente, coloque-a no idioma do cliente entre as linhas 'MENSAGEM:' e o fim.\n" +
              quotePromptRules(validity) +
              "- Quando o consultor passar voos/valores, monte a cotação nesse padrão (✈️ Cotação de Voos — Guatá, Trecho, Data, Opção 1/2/3 com '• Sem bagagem despachada' e '• Com bagagem despachada', passageiros, ⚠️ IMPORTANTE com prazo e aviso, e 'Cotação realizada em'). Se faltar dado, pergunte ao consultor; nunca invente valores.\n" +
              "\nConversa com o cliente:\n" +
              (transcript || "(sem mensagens ainda)"),
          },
          ...data.history,
        ],
        { maxTokens: 900 },
      );
      return { answer: answer || "Não consegui gerar uma resposta agora." };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "rate_limit") throw new Error("Muitas solicitações. Tente em alguns segundos.");
      if (msg === "credits_exhausted") throw new Error("Créditos de IA esgotados.");
      throw new Error("Falha ao consultar o Copiloto.");
    }
  });
