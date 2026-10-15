/**
 * Download de mídia recebida via WhatsApp Cloud API.
 */
import type { Line } from "@/lib/meta-send.server";

const MAX_BYTES = 5 * 1024 * 1024;

function lineEnv(line: Line, key: "ACCESS_TOKEN"): string | undefined {
  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  return (
    process.env[`META_${key}${suffix}`] ?? process.env[`META_${key}`]
  );
}

export interface DownloadedMedia {
  bytes: Uint8Array;
  mimeType: string;
}

export async function downloadWhatsAppMedia(
  line: Line,
  mediaId: string,
): Promise<DownloadedMedia | null> {
  const token = lineEnv(line, "ACCESS_TOKEN");
  if (!token || !mediaId) return null;

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    console.error("[meta-media] metadata:", metaRes.status, await metaRes.text().catch(() => ""));
    return null;
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) {
    console.error("[meta-media] download:", fileRes.status);
    return null;
  }
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    console.error("[meta-media] arquivo grande:", buf.length);
    return null;
  }
  return {
    bytes: buf,
    mimeType: meta.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream",
  };
}
