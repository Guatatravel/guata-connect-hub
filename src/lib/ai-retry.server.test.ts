import { describe, expect, test } from "bun:test";
import { isTransientAiError, withAiRetries } from "@/lib/ai-retry.server";

describe("isTransientAiError", () => {
  test("detects rate_limit and 503", () => {
    expect(isTransientAiError(new Error("rate_limit"))).toBe(true);
    expect(
      isTransientAiError(
        new Error('Gemini 503: {"error":{"status":"UNAVAILABLE","message":"high demand"}}'),
      ),
    ).toBe(true);
    expect(isTransientAiError(new Error("credits_exhausted"))).toBe(false);
  });
});

describe("withAiRetries", () => {
  test("retries then succeeds", async () => {
    let n = 0;
    const out = await withAiRetries(
      async () => {
        n += 1;
        if (n < 3) throw new Error("rate_limit");
        return "ok";
      },
      { attempts: 3, label: "test" },
    );
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
});
