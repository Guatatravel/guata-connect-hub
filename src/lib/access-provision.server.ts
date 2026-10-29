/**
 * Provisiona org + usuário a partir de access_requests (parceiro).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addOrganizationMember,
  createPartnerOrganization,
  isOrganizationAccessLiberado,
} from "@/lib/organizations.server";

function slugFromEmpresa(empresa: string): string {
  const base = empresa
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "parceiro";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 20; i++) {
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i + 2}`;
  }
  throw new Error("Não foi possível gerar slug único para a agência.");
}

function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 14);
  return `${base}!9`;
}

function parseProvisionNotas(notas: unknown): {
  organization_id?: string;
  user_id?: string;
  slug?: string;
  self_registered?: boolean;
} | null {
  if (!notas) return null;
  try {
    return JSON.parse(String(notas)) as {
      organization_id?: string;
      user_id?: string;
      slug?: string;
      self_registered?: boolean;
    };
  } catch {
    return null;
  }
}

async function liberatePartnerOrganization(
  organizationId: string,
  requestId: string,
): Promise<void> {
  const { error: orgErr } = await supabaseAdmin
    .from("organizations")
    .update({ access_liberado: true, updated_at: new Date().toISOString() })
    .eq("id", organizationId);
  if (orgErr) throw new Error(orgErr.message);

  const { error: reqErr } = await supabaseAdmin
    .from("access_requests")
    .update({
      status: "liberado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (reqErr) throw new Error(reqErr.message);
}

export interface ProvisionAccessResult {
  organizationId: string;
  userId: string;
  slug: string;
  tempPassword: string | null;
  email: string;
  alreadyProvisioned: boolean;
  accessLiberated?: boolean;
}

export interface RegisterPartnerInput {
  nome: string;
  empresa: string;
  email: string;
  password: string;
  whatsapp: string;
  cidade?: string | null;
  mensagem?: string | null;
}

/** Cadastro público: cria org + login; operação fica pendente até admin liberar. */
export async function registerPartnerSelfService(
  input: RegisterPartnerInput,
): Promise<{ email: string }> {
  const email = input.email.trim().toLowerCase();
  const nome = input.nome.trim();
  const empresa = input.empresa.trim();
  if (!email || !nome || !empresa) throw new Error("Preencha nome, empresa e e-mail.");
  if (input.password.length < 8) throw new Error("Senha deve ter pelo menos 8 caracteres.");

  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(listErr.message);
  if (list.users.some((u) => u.email?.toLowerCase() === email)) {
    throw new Error("Este e-mail já está cadastrado. Entre com sua senha ou recupere o acesso.");
  }

  const slug = await uniqueSlug(slugFromEmpresa(empresa));
  const organizationId = await createPartnerOrganization({
    name: empresa,
    slug,
    accessLiberado: false,
  });

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: nome, must_change_password: false },
  });
  if (createErr) throw new Error(createErr.message);
  const userId = created.user?.id;
  if (!userId) throw new Error("Falha ao criar usuário.");

  await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email,
      name: nome,
      must_change_password: false,
      active_organization_id: organizationId,
    },
    { onConflict: "id" },
  );

  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "consultor" });
  await addOrganizationMember(organizationId, userId, "owner");

  const notas = JSON.stringify({
    organization_id: organizationId,
    user_id: userId,
    slug,
    self_registered: true,
    provisioned_at: new Date().toISOString(),
  });

  const { error: reqErr } = await supabaseAdmin.from("access_requests").insert({
    nome,
    empresa,
    email,
    whatsapp: input.whatsapp.trim(),
    cidade: input.cidade?.trim() || null,
    mensagem: input.mensagem?.trim() || null,
    status: "novo",
    notas,
  });
  if (reqErr) throw new Error(reqErr.message);

  return { email };
}

export async function provisionPartnerFromAccessRequest(
  requestId: string,
): Promise<ProvisionAccessResult> {
  const { data: req, error } = await supabaseAdmin
    .from("access_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req) throw new Error("Solicitação não encontrada.");

  const email = String(req.email).trim().toLowerCase();
  if (!email) throw new Error("E-mail inválido na solicitação.");

  const parsed = parseProvisionNotas(req.notas);
  if (parsed?.organization_id && parsed.user_id) {
    const organizationId = parsed.organization_id;
    const alreadyLiberado = await isOrganizationAccessLiberado(organizationId);
    if (req.status === "liberado" && alreadyLiberado) {
      return {
        organizationId,
        userId: parsed.user_id,
        slug: parsed.slug ?? "",
        tempPassword: null,
        email,
        alreadyProvisioned: true,
      };
    }
    await liberatePartnerOrganization(organizationId, requestId);
    return {
      organizationId,
      userId: parsed.user_id,
      slug: parsed.slug ?? "",
      tempPassword: null,
      email,
      alreadyProvisioned: Boolean(parsed.self_registered),
      accessLiberated: true,
    };
  }

  const empresa = String(req.empresa ?? req.nome ?? "Parceiro").trim();
  const slug = await uniqueSlug(slugFromEmpresa(empresa));
  const organizationId = await createPartnerOrganization({ name: empresa, slug });

  let userId: string | undefined;
  let tempPassword: string | null = generateTempPassword();

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword!,
    email_confirm: true,
    user_metadata: {
      name: String(req.nome ?? empresa),
      must_change_password: true,
    },
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (!msg.includes("already") && !msg.includes("registered")) {
      throw new Error(createErr.message);
    }
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing?.id) throw new Error("Usuário já existe mas não foi encontrado.");
    userId = existing.id;
    tempPassword = null;
  } else {
    userId = created.user?.id;
  }

  if (!userId) throw new Error("Falha ao criar usuário.");

  await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email,
      name: String(req.nome ?? empresa),
      must_change_password: true,
      active_organization_id: organizationId,
    },
    { onConflict: "id" },
  );

  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!roleRow) {
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "consultor" });
  }

  await addOrganizationMember(organizationId, userId, "owner");

  const notas = JSON.stringify({
    organization_id: organizationId,
    user_id: userId,
    slug,
    provisioned_at: new Date().toISOString(),
  });

  await supabaseAdmin
    .from("access_requests")
    .update({
      status: "liberado",
      notas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  return {
    organizationId,
    userId,
    slug,
    tempPassword,
    email,
    alreadyProvisioned: false,
  };
}
