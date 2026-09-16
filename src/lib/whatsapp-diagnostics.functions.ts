import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWhatsAppDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { runWhatsAppDiagnostics } = await import(
      "@/lib/whatsapp-diagnostics.server"
    );
    await requireStaffUser(context.userId);
    return runWhatsAppDiagnostics();
  });

export const sendWhatsAppTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; text?: string }) => ({
    to: String(input?.to ?? "").slice(0, 30),
    text: String(input?.text ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { sendTestWhatsApp } = await import(
      "@/lib/whatsapp-diagnostics.server"
    );
    await requireStaffUser(context.userId);
    return sendTestWhatsApp(
      data.to,
      data.text || "Teste do Guatá Channel: a conexão com o WhatsApp está ativa.",
    );
  });
