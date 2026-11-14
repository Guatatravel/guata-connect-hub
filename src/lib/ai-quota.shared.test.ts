import { describe, expect, test } from "bun:test";
import { aiPeriodKey, aiPeriodResetsOn } from "./ai-quota.shared";

describe("ai quota period", () => {
  test("starts on day 10 in Cuiaba", () => {
    expect(aiPeriodKey(new Date("2026-11-10T04:00:00.000Z"))).toBe("2026-11-10");
    expect(aiPeriodKey(new Date("2026-11-10T03:59:00.000Z"))).toBe("2026-10-10");
  });

  test("names the next day 10", () => {
    expect(aiPeriodResetsOn("2026-11-10")).toBe("2026-12-10");
    expect(aiPeriodResetsOn("2026-12-10")).toBe("2027-01-10");
  });
});
