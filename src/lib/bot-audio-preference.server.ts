/**
 * Preferência do cliente: respostas do bot em áudio (WhatsApp).
 * Persistido em sessions.intake_data.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOrgBotAudioPolicy } from "@/lib/bot-audio-org.server";
import { isBotTtsConfigured } from "@/lib/tts.server";

export type BotVoiceProfile = "male" | "female";

export interface BotAudioPrefs {
  enabled: boolean;
  voice: BotVoiceProfile;
}

const INTAKE_ENABLED = "bot_audio_enabled";
const INTAKE_VOICE = "bot_voice_profile";

export function readBotAudioPrefs(
  intake: Record<string, unknown> | undefined,
): BotAudioPrefs {
  const voice = intake?.[INTAKE_VOICE];
  return {
    enabled: intake?.[INTAKE_ENABLED] === true,
    voice: voice === "female" ? "female" : "male",
  };
}

export type AudioPrefCommandResult =
  | { handled: false }
  | { handled: true; reply: string; prefs?: BotAudioPrefs };

export async function handleBotAudioPreferenceMessage(
  sessionId: string,
  intake: Record<string, unknown>,
  text: string,
  organizationId: string,
): Promise<AudioPrefCommandResult> {
  const raw = text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const orgPolicy = await getOrgBotAudioPolicy(organizationId);

  if (
    /\b(opcoes de audio|opcao de audio|configurar audio|preferencia de audio|como funciona o audio)\b/i.test(
      raw,
    )
  ) {
    const p = readBotAudioPrefs(intake);
    const status = p.enabled ? "ligado" : "desligado";
    const voz = p.voice === "female" ? "feminina" : "masculina";
    return {
      handled: true,
      reply:
        "Áudio do Guatá no WhatsApp:\n\n" +
        "• *Ativar áudio* — envio a resposta em voz.\n" +
        "• *Só texto* — desligo o áudio automático.\n" +
        "• *Voz masculina* ou *voz feminina* — escolhe o tom.\n\n" +
        `Agora: áudio *${status}*, voz *${voz}*.\n` +
        'Comandos: "ativar áudio", "só texto", "voz masculina", "voz feminina".',
      prefs: p,
    };
  }

  if (
    /\b(ativar audio|quero audio|resposta em audio|responder em audio|modo audio|com audio)\b/i.test(
      raw,
    )
  ) {
    if (!orgPolicy.allowBotAudio) {
      return {
        handled: true,
        reply:
          "No momento sua agência atende só por *texto* no WhatsApp. Se quiser ouvir o Guatá em áudio, peça ao consultor sobre o add-on de voz.",
        prefs: readBotAudioPrefs(intake),
      };
    }
    const prefs = await persistBotAudioPrefs(sessionId, intake, { enabled: true });
    const ttsNote = isBotTtsConfigured()
      ? ""
      : "\n\n(O servidor de voz ainda não está configurado — por enquanto você recebe só texto até ativarmos a API de áudio.)";
    return {
      handled: true,
      reply:
        "Combinado! Nas próximas respostas eu mando *áudio* do Guatá quando couber. Para voltar ao texto, digite *só texto*." +
        ttsNote,
      prefs,
    };
  }

  if (/\b(desativar audio|sem audio|so texto|apenas texto|modo texto)\b/i.test(raw)) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { enabled: false });
    return {
      handled: true,
      reply:
        "Beleza! A partir de agora respondo só em *texto*. Para áudio de novo, digite *ativar áudio*.",
      prefs,
    };
  }

  if (/\b(voz feminina|voz de mulher|voz mulher)\b/i.test(raw)) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { voice: "female" });
    const extra = prefs.enabled
      ? " Quando eu mandar áudio, será com essa voz."
      : ' Digite *ativar áudio* para eu responder em voz.';
    return {
      handled: true,
      reply: `Voz *feminina* salva.${extra}`,
      prefs,
    };
  }

  if (/\b(voz masculina|voz de homem|voz homem)\b/i.test(raw)) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { voice: "male" });
    const extra = prefs.enabled
      ? " Quando eu mandar áudio, será com essa voz."
      : ' Digite *ativar áudio* para eu responder em voz.';
    return {
      handled: true,
      reply: `Voz *masculina* do Guatá salva.${extra}`,
      prefs,
    };
  }

  return { handled: false };
}

export async function persistBotAudioPrefs(
  sessionId: string,
  intake: Record<string, unknown>,
  patch: Partial<BotAudioPrefs>,
): Promise<BotAudioPrefs> {
  const current = readBotAudioPrefs(intake);
  const next: BotAudioPrefs = {
    enabled: patch.enabled ?? current.enabled,
    voice: patch.voice ?? current.voice,
  };
  const intake_data = {
    ...intake,
    [INTAKE_ENABLED]: next.enabled,
    [INTAKE_VOICE]: next.voice,
    bot_audio_updated_at: new Date().toISOString(),
  };
  await supabaseAdmin
    .from("sessions")
    .update({ intake_data: intake_data as never })
    .eq("id", sessionId);
  return next;
}
