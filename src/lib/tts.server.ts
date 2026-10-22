/**
 * Texto → áudio para respostas do bot no WhatsApp.
 *
 * Env (opcional, use um provedor):
 * - ELEVENLABS_API_KEY + GUATA_TTS_VOICE_MALE_ID / GUATA_TTS_VOICE_FEMALE_ID
 * - OPENAI_API_KEY + GUATA_TTS_OPENAI_VOICE_MALE (default onyx) / GUATA_TTS_OPENAI_VOICE_FEMALE (default nova)
 */
import type { BotVoiceProfile } from "@/lib/bot-audio-preference.server";

const MAX_SPEECH_CHARS = 700;

export function plainTextForSpeech(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/https?:\/\/[^\s]+/gi, " link na mensagem ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

function maleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_MALE_ID?.trim() ||
    null
  );
}

function femaleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_FEMALE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_FEMALE_ID?.trim() ||
    null
  );
}

function elevenLabsTtsReady(): boolean {
  return Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() && (maleVoiceId() || femaleVoiceId()),
  );
}

/** True se OpenAI ou ElevenLabs (com voice id) estiverem prontos. */
export function isBotTtsConfigured(): boolean {
  return elevenLabsTtsReady() || Boolean(process.env.OPENAI_API_KEY?.trim());
}

function voiceIdFor(profile: BotVoiceProfile): string | null {
  if (profile === "female") return femaleVoiceId() || maleVoiceId();
  return maleVoiceId() || femaleVoiceId();
}

function openAiVoice(profile: BotVoiceProfile): string {
  if (profile === "female") {
    return process.env.GUATA_TTS_OPENAI_VOICE_FEMALE?.trim() || "nova";
  }
  return process.env.GUATA_TTS_OPENAI_VOICE_MALE?.trim() || "onyx";
}

async function synthesizeElevenLabs(
  text: string,
  profile: BotVoiceProfile,
): Promise<Uint8Array | null> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = voiceIdFor(profile);
  if (!key || !voiceId) return null;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    }),
  });
  if (!res.ok) {
    console.error("[tts] elevenlabs:", res.status, await res.text().catch(() => ""));
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function synthesizeOpenAi(
  text: string,
  profile: BotVoiceProfile,
): Promise<Uint8Array | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GUATA_TTS_OPENAI_MODEL?.trim() || "gpt-4o-mini-tts",
      input: text,
      voice: openAiVoice(profile),
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    console.error("[tts] openai:", res.status, await res.text().catch(() => ""));
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function synthesizeBotSpeech(
  text: string,
  profile: BotVoiceProfile,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const spoken = plainTextForSpeech(text);
  if (!spoken || spoken.length < 3) return null;

  if (elevenLabsTtsReady()) {
    const bytes = await synthesizeElevenLabs(spoken, profile);
    if (bytes?.length) return { bytes, mimeType: "audio/mpeg" };
  }

  const bytes = await synthesizeOpenAi(spoken, profile);
  if (bytes?.length) return { bytes, mimeType: "audio/mpeg" };
  return null;
}
