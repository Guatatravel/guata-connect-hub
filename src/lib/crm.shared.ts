/** Organização da conversa no painel. Não é etiqueta nem status do aplicativo WhatsApp. */

export const CRM_GUIDES = ["Viagens internacionais", "Cruzeiros", "Turismo Brasil"] as const;

export const CRM_COLUMNS = [
  { id: "interessados", label: "Interessados" },
  { id: "orcamento", label: "Orçamento enviado" },
  { id: "fechado", label: "Compra finalizada" },
] as const;

export type CrmColumnId = (typeof CRM_COLUMNS)[number]["id"];

export type FollowUpDelayUnit = "minutes" | "hours" | "days";

export type FollowUpStep = {
  delay: number;
  unit: FollowUpDelayUnit;
  text: string;
  templateName?: string;
};

export type FollowUpHistoryEntry = {
  stepIndex: number;
  at: string;
  status: "sent" | "skipped" | "error";
  detail?: string;
  text?: string;
};

export type FollowUpState = {
  dueAt: string;
  text: string;
  templateName?: string;
  status: "pending" | "sent" | "skipped" | "paused";
  detail?: string;
  /** Etapas do ciclo (1–3). Se ausente, trata como 1 etapa legada. */
  steps?: FollowUpStep[];
  /** Índice da etapa atual (0-based). */
  stepIndex?: number;
  history?: FollowUpHistoryEntry[];
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

export function followUpDelayMs(delay: number, unit: FollowUpDelayUnit): number {
  const n = Math.max(1, Math.floor(delay));
  if (unit === "minutes") return Math.min(n, 60 * 24 * 14) * 60_000;
  if (unit === "hours") return Math.min(n, 24 * 30) * 3_600_000;
  return Math.min(n, 30) * 86_400_000;
}

export function normalizeFollowUpSteps(steps: FollowUpStep[]): FollowUpStep[] {
  return steps
    .slice(0, 3)
    .map((s) => ({
      delay: Math.max(1, Math.floor(Number(s.delay) || 1)),
      unit: (["minutes", "hours", "days"].includes(s.unit) ? s.unit : "days") as FollowUpDelayUnit,
      text: String(s.text ?? "").trim().slice(0, 1000),
      templateName: s.templateName?.trim() || undefined,
    }))
    .filter((s) => s.text.length > 0);
}

function parseFollowUp(raw: unknown): FollowUpState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const fu = raw as Record<string, unknown>;
  if (typeof fu.dueAt !== "string" || typeof fu.text !== "string" || typeof fu.status !== "string") {
    return undefined;
  }
  const status = fu.status as FollowUpState["status"];
  if (!["pending", "sent", "skipped", "paused"].includes(status)) return undefined;

  let steps: FollowUpStep[] | undefined;
  if (Array.isArray(fu.steps)) {
    const normalized = normalizeFollowUpSteps(fu.steps as FollowUpStep[]);
    if (normalized.length) steps = normalized;
  }

  const history = Array.isArray(fu.history)
    ? (fu.history as FollowUpHistoryEntry[]).slice(-12).map((h): FollowUpHistoryEntry => ({
        stepIndex: Number(h.stepIndex) || 0,
        at: String(h.at ?? ""),
        status:
          h.status === "sent" || h.status === "error"
            ? h.status
            : ("skipped" as const),
        detail: h.detail ? String(h.detail) : undefined,
        text: h.text ? String(h.text) : undefined,
      }))
    : undefined;

  return {
    dueAt: fu.dueAt,
    text: fu.text,
    templateName: fu.templateName ? String(fu.templateName) : undefined,
    status,
    detail: fu.detail ? String(fu.detail) : undefined,
    steps,
    stepIndex: typeof fu.stepIndex === "number" ? fu.stepIndex : steps ? 0 : undefined,
    history,
  };
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
  return {
    guide: typeof raw.crm_guide === "string" && raw.crm_guide.trim() ? raw.crm_guide.trim() : undefined,
    labels,
    column,
    followUp: parseFollowUp(raw.follow_up),
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
