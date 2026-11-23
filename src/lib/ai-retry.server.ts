/** Retry curto para 429/503 (Gemini congestionado) e classificação de erro transitório. */

export function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "rate_limit") return true;
  if (/\b503\b/.test(msg)) return true;
  if (/\b429\b/.test(msg)) return true;
  if (/UNAVAILABLE|high demand|overloaded|try again later/i.test(msg)) return true;
  return false;
}

export async function withAiRetries<T>(
  run: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      last = e;
      if (!isTransientAiError(e) || i === attempts - 1) throw e;
      const waitMs = 400 * 2 ** i + Math.floor(Math.random() * 200);
      console.warn(
        `[ai-retry] ${opts.label ?? "call"} tentativa ${i + 1}/${attempts} falhou (transitório); aguarda ${waitMs}ms`,
        e instanceof Error ? e.message : e,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw last;
}
