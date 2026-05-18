import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRST_ADMIN_EMAIL = "guilhermearevalo27@gmail.com";

function generateTempPassword(): string {
  // 16 chars alfanuméricos + símbolo — exigência mínima para Supabase
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 14);
  return `${base}!9`;
}

async function adminExists(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function requireAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

/**
 * Cria o primeiro admin (guilhermearevalo27@gmail.com).
 * Só funciona se ainda não existir nenhum admin no sistema.
 * Retorna a senha temporária UMA ÚNICA VEZ.
 */
export const bootstrapFirstAdmin = createServerFn({ method: "POST" }).handler(
  async () => {
    if (await adminExists()) {
      throw new Error("Já existe um administrador. Use a tela de login.");
    }

    const tempPassword = generateTempPassword();

    // Tenta criar; se o email já existir, recupera o id e promove a admin
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: FIRST_ADMIN_EMAIL,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: "Guilherme Arevalo", must_change_password: true },
      });

    let userId: string | undefined = created?.user?.id;
    let returnedPassword: string | null = tempPassword;

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      const alreadyExists =
        msg.includes("already") || msg.includes("registered");
      if (!alreadyExists) {
        throw new Error(createErr.message);
      }
      // Usuário já existe (sem role admin). Recupera id e reseta senha.
      const { data: list, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw new Error(listErr.message);
      const existing = list.users.find((u) => u.email === FIRST_ADMIN_EMAIL);
      if (!existing) throw new Error("Usuário existe mas não foi encontrado.");
      userId = existing.id;

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            ...(existing.user_metadata ?? {}),
            must_change_password: true,
          },
        },
      );
      if (updErr) throw new Error(updErr.message);
    }

    if (!userId) throw new Error("Falha ao criar usuário admin.");

    // Garante profile (caso o trigger não tenha rodado por já existir)
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: FIRST_ADMIN_EMAIL,
          name: "Guilherme Arevalo",
          must_change_password: true,
        },
        { onConflict: "id" },
      );

    // Atribui role admin
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) {
      throw new Error(roleErr.message);
    }

    return {
      email: FIRST_ADMIN_EMAIL,
      tempPassword: returnedPassword,
    };
  },
);

/** Verifica se já existe admin (para esconder o /setup quando não for mais necessário). */
export const checkAdminExists = createServerFn({ method: "GET" }).handler(
  async () => ({ exists: await adminExists() }),
);

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "consultor"]),
});

/** Admin cria um novo usuário (consultor ou outro admin). */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, must_change_password: true },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Falha ao criar usuário.");

    await supabaseAdmin.from("profiles").upsert(
      {
        id: newId,
        email: data.email,
        name: data.name,
        must_change_password: true,
      },
      { onConflict: "id" },
    );

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { id: newId, email: data.email, role: data.role };
  });

/** Admin lista usuários com roles. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, must_change_password, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    }

    return (profiles ?? []).map((p) => ({
      ...p,
      roles: byUser.get(p.id) ?? [],
    }));
  });

const deleteUserSchema = z.object({ userId: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir a si mesmo.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marca must_change_password = false (chamado após troca de senha bem-sucedida). */
export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });