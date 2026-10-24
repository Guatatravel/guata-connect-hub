/**
 * O Chrome grava áudio em WebM. A API do WhatsApp só entrega MP3, M4A, AAC, AMR e OGG Opus.
 * A conversão roda no navegador, antes do envio.
 */
import { Mp3Encoder } from "@breezystack/lamejs";

const PASSTHROUGH = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/amr",
]);

function baseMime(type: string): string {
  return type.toLowerCase().split(";")[0].trim();
}

export function needsWhatsAppAudioTranscode(file: File): boolean {
  const mime = baseMime(file.type);
  const name = file.name.toLowerCase();
  if (mime.includes("webm") || name.endsWith(".webm")) return true;
  if (PASSTHROUGH.has(mime)) return false;
  if (/\.(mp3|m4a|aac|ogg|amr)$/.test(name)) return false;
  return true;
}

function mixMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const out = new Float32Array(length);
  const channels = buffer.numberOfChannels || 1;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

function floatTo16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function transcodeToMp3(file: File): Promise<File> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const pcm = floatTo16(mixMono(decoded));
    const rate = decoded.sampleRate;
    const encoder = new Mp3Encoder(1, rate, 64);
    const chunks: Uint8Array[] = [];
    const block = 1152;
    for (let i = 0; i < pcm.length; i += block) {
      const part = encoder.encodeBuffer(pcm.subarray(i, i + block));
      if (part.length > 0) chunks.push(part);
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    if (blob.size < 128) throw new Error("Áudio vazio depois da conversão.");
    return new File([blob], `audio-${Date.now()}.mp3`, { type: "audio/mpeg" });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "falha desconhecida";
    throw new Error(`Não consegui converter o áudio para MP3 (${detail}). Anexe um arquivo MP3.`);
  } finally {
    await ctx.close().catch(() => {});
  }
}
