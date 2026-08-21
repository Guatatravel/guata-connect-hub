import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Público: usado na tela de login e na sidebar. Devolve só uma URL assinada. */
export const fetchLogoUrl = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getLogoUrl } = await import("@/lib/branding.server");
    try {
      return { url: await getLogoUrl() };
    } catch {
      return { url: null as string | null };
    }
  },
);

const uploadSchema = z.object({
  base64: z.string().min(10).max(3_000_000),
  contentType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ]),
});

export const uploadLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => uploadSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireAdminUser } = await import("@/lib/diagnostics.server");
    await requireAdminUser(context.userId);
    const { saveLogo } = await import("@/lib/branding.server");
    return { url: await saveLogo(data.base64, data.contentType) };
  });

export const resetLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdminUser } = await import("@/lib/diagnostics.server");
    await requireAdminUser(context.userId);
    const { clearLogo } = await import("@/lib/branding.server");
    await clearLogo();
    return { ok: true };
  });
