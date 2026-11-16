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
    mutationFn: () =>
      save({
        data: {
          useOwnKey: own,
          apiKey: apiKey.trim() || undefined,
          clearKey,
          replyCap: data?.canSetCap ? (cap.trim() === "" ? null : Number(cap)) : undefined,
          aiProvider: provider,
        },
      }),
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
          Com <strong>GEMINI_API_KEY</strong> no servidor, o Guatá prioriza o Google Gemini (cota gratuita do AI
          Studio). Sem ela, usa a Lovable ({data.includedCredits} créditos de IA/mês no app). Chaves próprias da
          agência: chaves <code className="text-xs">AIza…</code> vão para o Gemini; demais, para a Lovable.
        </p>
        {(data.serverHasGemini || data.serverHasLovable) && (
          <p className="text-xs text-muted-foreground">
            Servidor: {data.serverHasGemini ? "Gemini configurado" : "Gemini ausente"}
            {" · "}
            {data.serverHasLovable ? "Lovable configurada" : "Lovable ausente"}
          </p>
        )}
        <p>
          Respostas neste período: <strong>{data.calls}</strong>. O contador zera em {data.resetsOn}.
        </p>
        {data.blocked && (
          <p className="text-destructive">
            {data.blockedReason === "quota"
              ? "O teto de respostas desta agência acabou. Volta no dia 10."
              : "Os créditos de IA desta conta acabaram. Volta no dia 10, ou quando a Lovable liberar de novo."}
          </p>
        )}
        {data.canEdit ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ai-own-key">Usar a chave de IA desta agência</Label>
              <Switch
                id="ai-own-key"
                checked={own}
                onCheckedChange={(checked) => {
                  setUseOwnKey(checked);
                  if (!checked) setClearKey(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Motor de IA</Label>
              <Select
                value={provider}
                onValueChange={(v) => setAiProvider(v as typeof provider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (Gemini se houver AIza ou GEMINI no servidor)</SelectItem>
                  <SelectItem value="gemini">Sempre Gemini</SelectItem>
                  <SelectItem value="lovable">Sempre Lovable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chave da agência (Lovable ou Gemini AI Studio)</Label>
              <Input
                type="password"
                value={apiKey}
                autoComplete="off"
                placeholder={data.hasOwnKey ? "Chave salva. Deixe vazio para manter." : "Cole a chave, se for usar a da agência"}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            {data.hasOwnKey && (
              <Button type="button" variant="outline" onClick={() => setClearKey(true)}>
                {clearKey ? "A chave será apagada ao salvar" : "Apagar chave salva"}
              </Button>
            )}
            {data.canSetCap && (
              <div className="space-y-1">
                <Label>Teto de respostas das outras agências na nossa chave</Label>
                <Input
                  inputMode="numeric"
                  value={cap}
                  placeholder="Em branco: sem teto de respostas"
                  onChange={(event) => setCapText(event.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">
                  A Guatá não entra nesse teto. Em branco, as agências usam a conta até a Lovable recusar.
                </p>
              </div>
            )}
            {!data.canSetCap && data.replyCap !== null && !own && (
              <p className="text-xs text-muted-foreground">
                Teto desta agência na chave da Guatá: {data.replyCap} respostas por período.
              </p>
            )}
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Salvando…" : "Salvar inteligência"}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Somente o dono ou administrador altera esta conta de IA.</p>
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
      ? `O teto de respostas desta agência acabou. Volta em ${data.resetsOn}.`
      : `Os créditos de IA acabaram. A Lovable inclui ${data.includedCredits} créditos por mês para o app inteiro. O aviso some em ${data.resetsOn}, ou quando a conta voltar a responder.`;
  return (
    <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {text}
    </div>
  );
}
