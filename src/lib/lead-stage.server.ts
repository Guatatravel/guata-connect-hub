/**
 * Estágio de lead (SDR suave) para sessões WhatsApp — server-only.
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

const HOT_RE =
  /\b(fechar|reservar|quero comprar|quero pacote|passa(r)?\s+(o\s+)?orçamento|passa(r)?\s+(o\s+)?orcamento|chama(r)?\s+(um\s+)?consultor|falar com (um\s+)?consultor|quero orçamento|fechar pacote)\b/i;

const QUALIFY_RE =
  /\b(quanto custa|quanto fica|montar (uma\s+)?viagem|pacote|lua de mel|honeymoon|orçamento|orcamento|viajar|viagem|hotel|voo|passagem|casal|fam[ií]lia|adultos|crianças|pessoas)\b/i;

const DATE_OR_MONEY_RE =
  /\b(r\$\s*\d|(\d{1,2}\s*(mil|k)\b)|\b\d{1,2}\/\d{1,2}\b|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;

const INTERNATIONAL_RE =
  /\b(punta cana|canc[uú]n|europa|disney|paris|maldivas|orlando|caribe|exterior|internacional|miami|cruzeiro)\b/i;

export function detectLeadStage(userText: string, userTurnCount: number): LeadStage {
  const t = userText.trim();
  if (!t) return "informacional";
  if (HOT_RE.test(t)) return "quente";
  if (QUALIFY_RE.test(t) && DATE_OR_MONEY_RE.test(t)) return "qualificando";
  if (QUALIFY_RE.test(t)) return "qualificando";
  if (userTurnCount >= 2 && INTERNATIONAL_RE.test(t)) return "qualificando";
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
    opts.mayOfferTravelHook
      ? `- Se o assunto for viagem internacional em andamento, você pode UMA vez sugerir: "Quer que a ${agencyName} monte isso para você?" (sem repetir se já ofereceu).\n`
      : "";

  return (
    `\n## FUNIL ${agencyName} (SDR suave — personagem continua sendo o Guatá)\n` +
    `- Nome da agência comercial: sempre "${agencyName}". Não invente outro nome de agência.\n` +
    `- informacional: priorize ajudar com conteúdo turístico. NÃO peça orçamento nem insista em venda.\n` +
    `- qualificando: responda o que pediram e, se faltar, faça até 2 perguntas curtas (datas, pessoas, faixa de investimento).\n` +
    `- quente: conduza ao próximo passo (consultor ou fechamento). Ofereça consultor da ${agencyName} quando couber.\n` +
    `- Estágio atual desta conversa: ${stage}.\n` +
    `- Em dúvida puramente informativa, mantenha tom de guia; convite comercial só com sinal claro de viagem/orçamento.\n` +
    hook
  );
}
