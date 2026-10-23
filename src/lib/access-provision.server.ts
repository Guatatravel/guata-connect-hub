/**
 * Provisiona org + usuário a partir de access_requests (parceiro).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addOrganizationMember,
  createPartnerOrganization,
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

export interface ProvisionAccessResult {
  organizationId: string;
  userId: string;
  slug: string;
  tempPassword: string | null;
  email: string;
  alreadyProvisioned: boolean;
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

  if (req.notas) {
    try {
      const parsed = JSON.parse(String(req.notas)) as {
        organization_id?: string;
        user_id?: string;
        slug?: string;
      };
      if (parsed.organization_id && parsed.user_id) {
        return {
          organizationId: parsed.organization_id,
          userId: parsed.user_id,
          slug: parsed.slug ?? "",
          tempPassword: null,
          email,
          alreadyProvisioned: true,
        };
      }
    } catch {
      /* notas livres — continua */
    }
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
