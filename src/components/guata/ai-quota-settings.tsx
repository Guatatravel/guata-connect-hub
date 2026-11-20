import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchAiQuota, saveAiQuota } from "@/lib/ai-quota.functions";

export function AiQuotaSettings() {
  const qc = useQueryClient();
  const load = useServerFn(fetchAiQuota);
  const save = useServerFn(saveAiQuota);
  const { data } = useQuery({ queryKey: ["ai-quota"], queryFn: () => load() });
  const [useOwnKey, setUseOwnKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [capText, setCapText] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<"auto" | "gemini" | "lovable" | null>(null);

  const own = useOwnKey ?? data?.useOwnKey ?? false;
  const provider = aiProvider ?? (data?.aiProvider as "auto" | "gemini" | "lovable") ?? "auto";
  const cap = capText ?? (data?.replyCap === null || data?.replyCap === undefined ? "" : String(data.replyCap));

  const mut = useMutation({
    mutationFn: () => {
      if (own && !apiKey.trim() && !data?.hasOwnKey && !clearKey) {
        throw new Error(
          "Cole a chave da agência ou desligue «Usar chave da minha agência» antes de salvar.",
        );
      }
      return save({
        data: {
          useOwnKey: own,
          apiKey: apiKey.trim() || undefined,
          clearKey,
          replyCap: data?.canSetCap ? (cap.trim() === "" ? null : Number(cap)) : undefined,
          aiProvider: provider,
        },
      });
    },
    onSuccess: () => {
      toast.success("Inteligência salva");
      setApiKey("");
      setClearKey(false);
      setCapText(null);
      setUseOwnKey(null);
      void qc.invalidateQueries({ queryKey: ["ai-quota"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-display text-base">Inteligência</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          O Guatá responde com inteligência artificial. Por padrão usa a conta compartilhada da Guatá. Se a sua
          agência tiver chave própria, você pode colar aqui.
        </p>
        <p>
          Respostas neste mês: <strong>{data.calls}</strong> (zera todo dia <strong>10</strong>).
        </p>
        {data.blocked && (
          <p className="text-destructive">
            {data.blockedReason === "quota"
              ? "O limite de respostas desta agência acabou. Volta no dia 10."
              : "As respostas automáticas pausaram por limite da conta. Volta no dia 10 ou quando a conta liberar de novo."}
          </p>
        )}
        {data.canEdit ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ai-own-key">Usar chave da minha agência</Label>
              <Switch
                id="ai-own-key"
                checked={own}
                onCheckedChange={(checked) => {
                  setUseOwnKey(checked);
                  if (!checked) setClearKey(false);
                }}
              />
            </div>
            {own && (
              <div className="space-y-1">
                <Label>Chave (opcional)</Label>
                <Input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={data.hasOwnKey ? "Chave salva — deixe vazio para manter" : "Cole a chave da agência"}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                {data.hasOwnKey && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setClearKey(true)}>
                    {clearKey ? "Será apagada ao salvar" : "Apagar chave salva"}
                  </Button>
                )}
              </div>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ajustes avançados (suporte)</summary>
              <div className="space-y-2 mt-2 pl-1">
                <Label className="text-xs">Motor</Label>
                <Select value={provider} onValueChange={(v) => setAiProvider(v as typeof provider)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="lovable">Lovable</SelectItem>
                  </SelectContent>
                </Select>
                {(data.serverHasGemini || data.serverHasLovable) && (
                  <p>
                    Servidor: {data.serverHasGemini ? "Gemini ok" : "sem Gemini"} ·{" "}
                    {data.serverHasLovable ? "Lovable ok" : "sem Lovable"}
                  </p>
                )}
              </div>
            </details>
            {data.canSetCap && (
              <div className="space-y-1">
                <Label>Limite de respostas (outras agências na nossa conta)</Label>
                <Input
                  inputMode="numeric"
                  value={cap}
                  placeholder="Vazio = sem limite"
                  onChange={(event) => setCapText(event.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">A Guatá não entra nesse limite.</p>
              </div>
            )}
            {!data.canSetCap && data.replyCap !== null && !own && (
              <p className="text-xs text-muted-foreground">
                Limite desta agência na conta da Guatá: {data.replyCap} respostas por mês.
              </p>
            )}
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Somente o dono ou administrador altera a inteligência.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AiQuotaBanner() {
  const load = useServerFn(fetchAiQuota);
  const { data } = useQuery({ queryKey: ["ai-quota"], queryFn: () => load() });
  if (!data?.blocked) return null;
  const text =
    data.blockedReason === "quota"
      ? `Limite de respostas desta agência. Volta em ${data.resetsOn}.`
      : `Respostas automáticas pausadas. Volta em ${data.resetsOn}.`;
  return (
    <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {text}
    </div>
  );
}