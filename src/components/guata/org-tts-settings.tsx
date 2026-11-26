import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchOrgTts, saveOrgTts } from "@/lib/org-tts.functions";

export function OrgTtsSettings() {
  const qc = useQueryClient();
  const load = useServerFn(fetchOrgTts);
  const save = useServerFn(saveOrgTts);
  const { data } = useQuery({ queryKey: ["org-tts"], queryFn: () => load() });
  const [useOwn, setUseOwn] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [maleId, setMaleId] = useState<string | null>(null);
  const [femaleId, setFemaleId] = useState<string | null>(null);

  const own = useOwn ?? data?.useOwnElevenlabs ?? false;

  const mut = useMutation({
    mutationFn: () => {
      if (own && !apiKey.trim() && !data?.hasOwnElevenlabsKey && !clearKey) {
        throw new Error("Cole a chave ElevenLabs da agência ou desligue o uso da chave própria.");
      }
      return save({
        data: {
          useOwnElevenlabs: own,
          apiKey: apiKey.trim() || undefined,
          clearKey,
          voiceMaleId: maleId === null ? undefined : maleId,
          voiceFemaleId: femaleId === null ? undefined : femaleId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Voz do BOT salva");
      setApiKey("");
      setClearKey(false);
      setMaleId(null);
      setFemaleId(null);
      setUseOwn(null);
      void qc.invalidateQueries({ queryKey: ["org-tts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-display text-base">Voz do BOT (ElevenLabs)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Quando o cliente manda áudio, o BOT pode responder em voz. Por padrão usa a conta do
          servidor (se configurada). Sua agência pode colar a própria chave ElevenLabs.
        </p>
        {data.serverHasElevenlabs && (
          <p className="text-xs text-muted-foreground">Servidor já tem ElevenLabs como fallback.</p>
        )}
        {data.canEdit ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tts-own">Usar ElevenLabs da minha agência</Label>
              <Switch
                id="tts-own"
                checked={own}
                onCheckedChange={(v) => {
                  setUseOwn(v);
                  if (!v) setClearKey(false);
                }}
              />
            </div>
            {own && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Chave API ElevenLabs</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder={
                      data.hasOwnElevenlabsKey
                        ? "Chave salva — deixe vazio para manter"
                        : "Cole a xi-api-key"
                    }
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {data.hasOwnElevenlabsKey && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setClearKey(true)}
                    >
                      {clearKey ? "Será apagada ao salvar" : "Apagar chave salva"}
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Voice ID masculina (opcional)</Label>
                  <Input
                    value={maleId ?? ""}
                    placeholder={
                      data.hasMaleVoiceId ? "Salvo — deixe vazio para manter" : "ID da voz no ElevenLabs"
                    }
                    onChange={(e) => setMaleId(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Voice ID feminina (opcional)</Label>
                  <Input
                    value={femaleId ?? ""}
                    placeholder={
                      data.hasFemaleVoiceId
                        ? "Salvo — deixe vazio para manter"
                        : "ID da voz no ElevenLabs"
                    }
                    onChange={(e) => setFemaleId(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sem Voice ID próprio, o BOT tenta as vozes padrão do servidor com a sua chave.
                </p>
              </div>
            )}
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Salvando…" : "Salvar voz"}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Somente o dono ou administrador altera a voz.</p>
        )}
      </CardContent>
    </Card>
  );
}
