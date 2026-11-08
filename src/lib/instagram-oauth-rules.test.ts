import { describe, expect, test } from "bun:test";
import { publicInstagramAccounts, validOAuthAttempt } from "./instagram-oauth-rules";

describe("Instagram authorization isolation", () => {
  const attempt = { user_id: "owner", organization_id: "agency-a", expires_at: "2026-11-08T16:20:00Z" };
  const now = Date.parse("2026-11-08T16:15:00Z");
  test("only the originating user can read the connection", () => {
    expect(validOAuthAttempt(attempt, "owner", "agency-a", now)).toBe(true);
    expect(validOAuthAttempt(attempt, "other", "agency-a", now)).toBe(false);
  });
  test("connection cannot move to another organization", () => {
    expect(validOAuthAttempt(attempt, "owner", "agency-b", now)).toBe(false);
  });
  test("expired attempts cannot be used", () => {
    expect(validOAuthAttempt(attempt, "owner", "agency-a", Date.parse(attempt.expires_at))).toBe(false);
  });
  test("page credentials never appear in public account data", () => {
    expect(publicInstagramAccounts([{ id: "123", pageId: "456", name: "Agency", token: "private-example" }])).toEqual([{ id: "123", pageId: "456", name: "Agency" }]);
  });
});