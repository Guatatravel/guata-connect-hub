import { describe, expect, test } from "bun:test";
import {
  enqueueInboundMessage,
  shouldCoalesceInbound,
} from "@/lib/inbound-coalesce.server";
import type { IncomingMessage } from "@/lib/message-pipeline.server";

function base(partial: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    organizationId: "org",
    line: "descubra",
    phone: "5511999999999",
    text: "oi",
    inboundKind: "text",
    ...partial,
  };
}

describe("shouldCoalesceInbound", () => {
  test("text yes, audio no", () => {
    expect(shouldCoalesceInbound(base())).toBe(true);
    expect(shouldCoalesceInbound(base({ inboundKind: "audio" }))).toBe(false);
    expect(shouldCoalesceInbound(base({ quotedWaMessageId: "wamid.x" }))).toBe(false);
  });
});

describe("enqueueInboundMessage", () => {
  test("joins two rapid texts into one process call", async () => {
    const seen: string[] = [];
    const p1 = enqueueInboundMessage(base({ text: "viagem pra família" }), async (m) => {
      seen.push(m.text);
      return { replies: ["ok"], sessionId: "s1" };
    });
    const p2 = enqueueInboundMessage(base({ text: "pro nordeste" }), async (m) => {
      seen.push(m.text);
      return { replies: ["ok"], sessionId: "s1" };
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(seen).toEqual(["viagem pra família\npro nordeste"]);
    expect(r1.sessionId).toBe("s1");
    expect(r2.sessionId).toBe("s1");
  }, 5000);
});
