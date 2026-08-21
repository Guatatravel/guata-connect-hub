import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runDescubraDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser, runDiagnostics } = await import(
      "@/lib/diagnostics.server"
    );
    await requireStaffUser(context.userId);
    return { checks: await runDiagnostics(), ranAt: new Date().toISOString() };
  });

export const sendTestDescubraEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser, sendTestEvent } = await import(
      "@/lib/diagnostics.server"
    );
    await requireStaffUser(context.userId);
    return sendTestEvent();
  });
