import { describe, expect, test } from "bun:test";
import { currentServicePeriodBounds, serviceFreeTier } from "@/lib/bot-pause.server";

describe("bot-pause", () => {
  test("free tier 1000", () => {
    expect(serviceFreeTier()).toBe(1000);
  });

  test("period bounds are ISO strings", () => {
    const { startIso, endIso } = currentServicePeriodBounds(new Date("2026-11-26T12:00:00Z"));
    expect(startIso).toContain("2026-11");
    expect(endIso > startIso).toBe(true);
  });
});
