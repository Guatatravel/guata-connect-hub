/**
 * Cliente Supabase secundário para o projeto Descubra MS.
 * Configure via env: VITE_DESCUBRA_SUPABASE_URL + VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export async function getDescubraClient(): Promise<SupabaseClient | null> {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_DESCUBRA_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY as
    | string
    | undefined;
  if (!url || !key) {
    cached = null;
    return null;
  }
  const { createClient } = await import("@supabase/supabase-js");
  cached = createClient(url, key);
  return cached;
}

export const isDescubraConfigured = () =>
  Boolean(
    import.meta.env.VITE_DESCUBRA_SUPABASE_URL &&
      import.meta.env.VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY,
  );