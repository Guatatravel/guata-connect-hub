/**
 * Estágio de lead (SDR suave) para sessões WhatsApp — server-only.
 * Informacional = só informação. Qualificar só com sinal claro de compra.
 */

export type LeadStage = "informacional" | "qualificando" | "quente";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  informacional: "Informacional",
  qualificando: "Qualificando",
  quente: "Lead quente",
};

const STAGE_RANK: Record<LeadStage, number> = {
  informacional: 0,
  qualificando: 1,
  quente: 2,
};

/** Intenção forte de fechar / falar com consultor. */
const HOT_RE =
  /\b(fechar|reservar|quero comprar|quero (o )?pacote|passa(r)?\s+(o\s+)?or[cç]amento|chama(r)?\s+(um\s+)?consultor|falar com (um\s+)?consultor|quero or[cç]amento|fechar pacote|manda(r)? (a |o )?(proposta|cotação|cotacao))\b/i;

/**
 * Sinal de cotação / montar viagem (não basta citar "viagem" ou "hotel").
 * Exige verbo de intenção ou pedido de preço/pacote sob medida.
 */
const BUY_INTENT_RE =
  /\b(quero (montar|fazer|ir|viajar|um pacote|uma viagem)|vamos (montar|viajar|para)|preciso (de )?(or[cç]amento|pacote|cotação|cotacao)|mont(a|ar) (uma |um )?(viagem|pacote|roteiro)|cot(a|ar|ação|acao)|or[cç]amento|quanto (custa|fica|sai|seria)|fa[cç]a (um |uma )?(or[cç]amento|pacote)|me (passa|manda) (o |um |uma )?(pre[cç]o|valor|or[cç]amento|pacote))\b/i;

/** Pergunta só informativa — não sobe funil. */
const INFO_ONLY_RE =
  /\b(como [eé]|o que (fazer|visitar|ver)|onde (fica|comer|ficar)|me (conta|fala|diz) (sobre|mais)|dica|roteiro de|vale a pena|tem (praia|cachoeira|passeio)|qual (a )?melhor|hist[oó]ria|cultura)\b/i;

export function detectLeadStage(userText: string, _userTurnCount: number): LeadStage {
  const t = userText.trim();
  if (!t) return "informacional";
  if (HOT_RE.test(t)) return "quente";
  if (INFO_ONLY_RE.test(t) && !BUY_INTENT_RE.test(t) && !HOT_RE.test(t)) {
    return "informacional";
  }
  if (BUY_INTENT_RE.test(t)) return "qualificando";
  return "informacional";
}

export function mergeLeadStage(
  previous: LeadStage | undefined,
  detected: LeadStage,
): LeadStage {
  const prev = previous ?? "informacional";
  if (detected === "quente") return "quente";
  return STAGE_RANK[detected] > STAGE_RANK[prev] ? detected : prev;
}

export function leadStagePromptSection(
  stage: LeadStage,
  agencyName: string,
  opts: { mayOfferTravelHook: boolean },
): string {
  const hook =
    opts.mayOfferTravelHook && stage !== "informacional"
      ? `- Só se o cliente já mostrou interesse em cotação/pacote, você pode UMA vez sugerir: "Quer que a ${agencyName} monte isso para você?" (sem repetir se já ofereceu).\n`
      : `- Estágio informacional: NÃO sugira que a agência "monte" a viagem; só responda a dúvida.\n`;

  return (
    `\n## FUNIL ${agencyName} (SDR suave — personagem continua sendo o Guatá)\n` +
    `- Nome da agência comercial: sempre "${agencyName}". Não invente outro nome de agência.\n` +
    `- informacional: o cliente quer INFORMAÇÃO. Responda completo. PROIBIDO perguntar origem, datas, quantidade de pessoas, orçamento, hospedagem ou transporte. PROIBIDO checklist de cotação.\n` +
    `- qualificando: o cliente pediu cotação/pacote/preço para viajar. Responda o que pediram e faça NO MÁXIMO 1 pergunta concreta por mensagem (só o que falta para cotar).\n` +
    `- quente: conduza ao próximo passo (consultor ou fechamento). Ofereça consultor da ${agencyName} quando couber.\n` +
    `- Estágio atual desta conversa: ${stage}.\n` +
    `- Se a mensagem for curiosidade/dica/roteiro sem pedido de compra, trate como informacional mesmo que cite destino ou hotel.\n` +
    hook
  );
}
