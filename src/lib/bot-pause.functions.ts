import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveOrganization } from "@/lib/auth-context.server";
import { getMetaAjudaStatus, setOrgBotPaused } from "@/lib/bot-pause.server";

export const fetchMetaAjudaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await requireActiveOrganization(context.userId);
    return getMetaAjudaStatus(orgId);
  });

export const setBotPausedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ paused: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    const orgId = await requireActiveOrganization(context.userId);
    const result = await setOrgBotPaused(orgId, data.paused);
    return {
      botPaused: Boolean(result.botPausedAt),
      botPausedAt: result.botPausedAt,
    };
  });
