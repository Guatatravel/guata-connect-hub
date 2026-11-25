/** Opt-out / não contatar — helpers puros (painel + server). */

export type DoNotContactReason =
  | "declined_invite"
  | "manual"
  | "client_request"
  | "deleted";

export type DoNotContactState = {
  active: boolean;
  at?: string;
  reason?: DoNotContactReason;
};

export function parseDoNotContact(intake: Record<string, unknown> | null | undefined): DoNotContactState {
  const raw = intake ?? {};
  if (raw.do_not_contact === true) {
    const reasonRaw = typeof raw.do_not_contact_reason === "string" ? raw.do_not_contact_reason : undefined;
    const reason: DoNotContactReason | undefined =
      reasonRaw === "declined_invite" ||
      reasonRaw === "manual" ||
      reasonRaw === "client_request" ||
      reasonRaw === "deleted"
        ? reasonRaw
        : undefined;
    return {
      active: true,
      at: typeof raw.do_not_contact_at === "string" ? raw.do_not_contact_at : undefined,
      reason,
    };
  }
  return { active: false };
}

/** Já recusou modelo/convite (mesmo antes do flag do_not_contact). */
export function hasDeclinedInvite(intake: Record<string, unknown> | null | undefined): boolean {
  const raw = intake ?? {};
  return typeof raw.template_declined_at === "string" && raw.template_declined_at.length > 0;
}

export function isContactDeleted(intake: Record<string, unknown> | null | undefined): boolean {
  const raw = intake ?? {};
  return typeof raw.contact_deleted_at === "string" && raw.contact_deleted_at.length > 0;
}

/** Pedido explícito para parar mensagens (texto livre). */
export function isStopContactRequest(text: string): boolean {
  const t = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (t.length > 160) return false;
  return (
    /\b(para(r)? de me (mandar|enviar)|nao (quero|mandem|enviem) (mais )?(mensagem|msg|whatsapp)|me tira(r)? (da |dessa )?(lista|disparo)|remova? (meu )?numero|stop|unsubscribe)\b/i.test(
      t,
    ) || /^(para|stop|nao quero mais)([!?.…\s]*)$/i.test(t)
  );
}

export function applyDoNotContact(
  intake: Record<string, unknown>,
  reason: DoNotContactReason,
): Record<string, unknown> {
  return {
    ...intake,
    do_not_contact: true,
    do_not_contact_at: new Date().toISOString(),
    do_not_contact_reason: reason,
  };
}

export function clearDoNotContact(intake: Record<string, unknown>): Record<string, unknown> {
  const next = { ...intake };
  delete next.do_not_contact;
  delete next.do_not_contact_at;
  delete next.do_not_contact_reason;
  return next;
}

export function applyContactDeleted(intake: Record<string, unknown>): Record<string, unknown> {
  return applyDoNotContact(
    {
      ...intake,
      contact_deleted_at: new Date().toISOString(),
    },
    intake.do_not_contact_reason === "declined_invite" ||
      intake.do_not_contact_reason === "client_request" ||
      intake.do_not_contact_reason === "manual"
      ? (intake.do_not_contact_reason as DoNotContactReason)
      : "deleted",
  );
}
