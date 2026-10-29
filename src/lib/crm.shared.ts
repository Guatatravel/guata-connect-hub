/** Organização da conversa no painel. Não é etiqueta nem status do aplicativo WhatsApp. */

export const CRM_GUIDES = ["Viagens internacionais", "Cruzeiros", "Turismo Brasil"] as const;

export const CRM_COLUMNS = [
  { id: "interessados", label: "Interessados" },
  { id: "orcamento", label: "Orçamento enviado" },
  { id: "fechado", label: "Compra finalizada" },
] as const;

export type CrmColumnId = (typeof CRM_COLUMNS)[number]["id"];

export type FollowUpState = {
  dueAt: string;
  text: string;
  templateName?: string;
  status: "pending" | "sent" | "skipped";
  detail?: string;
};

export type ConversationCrm = {
  guide?: string;
  labels: string[];
  column?: CrmColumnId;
  followUp?: FollowUpState;
  guideLocked: boolean;
};

export function columnLabel(id?: string): string {
  return CRM_COLUMNS.find((c) => c.id === id)?.label ?? "Sem coluna";
}

export function parseCrm(intake: Record<string, unknown> | null | undefined): ConversationCrm {
  const raw = intake ?? {};
  const labels = Array.isArray(raw.crm_labels)
    ? raw.crm_labels.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];
  const columnRaw = typeof raw.crm_column === "string" ? raw.crm_column : "";
  const column = CRM_COLUMNS.some((c) => c.id === columnRaw)
    ? (columnRaw as CrmColumnId)
    : undefined;
  const fu = raw.follow_up as FollowUpState | undefined;
  const followUp =
    fu && typeof fu.dueAt === "string" && typeof fu.text === "string" && fu.status
      ? {
          dueAt: fu.dueAt,
          text: fu.text,
          templateName: fu.templateName ? String(fu.templateName) : undefined,
          status: fu.status,
          detail: fu.detail ? String(fu.detail) : undefined,
        }
      : undefined;
  return {
    guide: typeof raw.crm_guide === "string" && raw.crm_guide.trim() ? raw.crm_guide.trim() : undefined,
    labels,
    column,
    followUp,
    guideLocked: raw.crm_guide_locked === true,
  };
}

/** Sugestão a partir do que o cliente escreveu. Não mexe em guia travada. */
export function suggestCrm(text: string): { guide?: string; column?: CrmColumnId } {
  const t = text.toLowerCase();
  let guide: string | undefined;
  if (/cruzeiro/.test(t)) guide = "Cruzeiros";
  else if (/bonito|pantanal|campo grande|mato grosso|turismo brasil/.test(t)) guide = "Turismo Brasil";
  else if (
    /punta cana|canc[uú]n|europa|disney|paris|orlando|miami|internacional|exterior|caribe|maldivas/.test(
      t,
    )
  ) {
    guide = "Viagens internacionais";
  }
  const interested = /orçamento|orcamento|quanto fica|quanto custa|reservar|pacote|cruzeiro|viagem|viajar/.test(
    t,
  );
  return { guide, column: interested ? "interessados" : undefined };
}
