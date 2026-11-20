/** Mensagens legíveis para falhas de IA no painel (Copiloto, dossiê, Guatá). */
export function formatAiErrorForPanel(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "Não foi possível consultar a IA. Tente de novo.";
  if (msg === "rate_limit") return "Muitas solicitações. Aguarde alguns segundos.";
  if (msg === "credits_exhausted") {
    return "Créditos de IA pausados neste período. Use chave própria em Configurações ou aguarde o dia 10.";
  }
  if (msg === "ai_quota") return "Limite de respostas da agência neste mês. Volta no dia 10.";
  if (msg === "Chave de IA da agência não configurada") {
    return "Ative «Usar chave da minha agência» e cole a chave em Configurações → Inteligência.";
  }
  if (msg === "Nenhuma chave de IA configurada no servidor.") {
    return "Nenhuma chave de IA no servidor. Configure em Configurações ou nos secrets do deploy.";
  }
  if (msg.startsWith("Gemini ")) return `Google Gemini: ${msg.slice(7, 220)}`;
  if (msg.startsWith("AI Gateway ")) return `Lovable: ${msg.slice(11, 220)}`;
  if (/^Chave Gemini/i.test(msg)) return msg;
  if (/^LOVABLE_API_KEY/i.test(msg)) return "Chave Lovable não configurada no servidor.";
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
}