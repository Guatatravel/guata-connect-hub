import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, Plus, Trash2 } from "lucide-react";
import {
  listAttendants,
  saveAttendant,
  removeAttendant,
  type AttendantInput,
} from "@/lib/attendants.functions";
import {
  fetchOrgBotAudioSettings,
  saveOrgBotAudioSettings,
} from "@/lib/organizations.functions";
import { useOrgLineUi } from "@/hooks/use-org-line-ui";
import { attendantLineOptions } from "@/lib/org-ui";

export const Route = createFileRoute("/_app/atendentes")({
  component: Atendentes,
  head: () => ({
    meta: [
      { title: "Agentes IA | Guatá Channel" },
      {
        name: "description",
        content:
          "Configure a personalidade, o tom de voz e as regras do atendente virtual de cada linha.",
      },
      { property: "og:title", content: "Atendentes | Guatá Channel" },
      {
        property: "og:description",
        content: "Personalize o atendente virtual da sua operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EMPTY: AttendantInput = {
  nome: "",
  line: "descubra",
  persona: "",
  tom: "cordial",
  saudacao: "",
  despedida: "",
  palavras_humano: ["humano", "atendente"],
  usa_base_local: true,
  usa_base_descubra: true,
  criatividade: 0.6,
  ativo: true,
  agent_gender: "male",
  tts_voice_profile: "male",
};

const TONS = [
  "cordial",
  "caloroso",
  "consultivo",
  "formal",
  "descontraído",
  "objetivo",
];

function Atendentes() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAttendants);
  const save = useServerFn(saveAttendant);
  const remove = useServerFn(removeAttendant);
  const fetchAudioSettings = useServerFn(fetchOrgBotAudioSettings);
  const saveAudioSettings = useServerFn(saveOrgBotAudioSettings);

  const [form, setForm] = useState<AttendantInput>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audioAllow, setAudioAllow] = useState(false);
  const [audioCap, setAudioCap] = useState("500");
  const [audioUnlimited, setAudioUnlimited] = useState(false);

  const { ui: orgUi } = useOrgLineUi();
  const lineOpts = attendantLineOptions(orgUi);

  const { data, isLoading } = useQuery({
    queryKey: ["attendants"],
    queryFn: () => fetchAll(),
  });

  const { data: audioSettings, isLoading: audioLoading } = useQuery({
    queryKey: ["org-bot-audio"],
    queryFn: () => fetchAudioSettings(),
  });

  useEffect(() => {
    if (!audioSettings) return;
    setAudioAllow(audioSettings.allowBotAudio);
    if (audioSettings.monthlyCap === null) {
      setAudioUnlimited(true);
      setAudioCap("500");
    } else {
      setAudioUnlimited(false);
      setAudioCap(String(audioSettings.monthlyCap));
    }
  }, [audioSettings]);

  const buildAudioPayload = () => ({
    allowBotAudio: audioAllow,
    monthlyCap:
      audioAllow && audioUnlimited ? null : audioAllow ? Number(audioCap) || 0 : null,
          clientDefaultOn: false,
  });

  useEffect(() => {
    if (!selectedId && data && data.length > 0) {
      setSelectedId(data[0]!.id as string);
    }
  }, [data, selectedId]);

  useEffect(() => {
    if (!data || !selectedId) return;
    const found = data.find((a) => a.id === selectedId);
    if (found) {
      setForm({
        id: found.id as string,
        nome: (found.nome as string) ?? "",
        line: (found.line as "descubra" | "viagens") ?? "descubra",
        persona: (found.persona as string) ?? "",
        tom: (found.tom as string) ?? "cordial",
        saudacao: (found.saudacao as string) ?? "",
        despedida: (found.despedida as string) ?? "",
        palavras_humano: (found.palavras_humano as string[]) ?? [],
        usa_base_local: Boolean(found.usa_base_local),
        usa_base_descubra: Boolean(found.usa_base_descubra),
        criatividade: Number(found.criatividade ?? 0.6),
        ativo: Boolean(found.ativo),
        agent_gender:
          (found as { agent_gender?: string }).agent_gender === "female"
            ? "female"
            : "male",
        tts_voice_profile:
          (found as { tts_voice_profile?: string }).tts_voice_profile === "female"
            ? "female"
            : "male",
      });
    }
  }, [data, selectedId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await save({ data: form });
      if (audioSettings?.canEdit) {
        await saveAudioSettings({ data: buildAudioPayload() });
      }
    },
    onSuccess: () => {
      toast.success("Atendente salvo");
      qc.invalidateQueries({ queryKey: ["attendants"] });
      qc.invalidateQueries({ queryKey: ["org-bot-audio"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Atendente removido");
      setSelectedId(null);
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["attendants"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível remover"),
  });

  const set = <K extends keyof AttendantInput>(k: K, v: AttendantInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Agentes IA</h1>
          <p className="text-muted-foreground text-sm">
            Aqui fica a personalidade do bot: tom, instruções, voz e quando passar para um
            humano. Horário, integrações e serviços da agência continuam em Configurações.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSelectedId(null);
            setForm(EMPTY);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo atendente
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <Skeleton className="h-10 w-full" />}
            {data?.map((a) => (
              <button
                key={a.id as string}
                onClick={() => setSelectedId(a.id as string)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedId === a.id ? "border-primary bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span className="font-medium truncate">{a.nome as string}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">WhatsApp oficial</Badge>
                  {a.ativo ? (
                    <Badge variant="secondary">ativo</Badge>
                  ) : (
                    <Badge variant="outline">inativo</Badge>
                  )}
                </div>
              </button>
            ))}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum atendente cadastrado.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Editar atendente" : "Novo atendente"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Ex.: Guatá — Turismo MS"
                />
              </div>
              <div className="space-y-2">
                <Label>Linha de WhatsApp</Label>
                <Select
                  value={form.line}
                  onValueChange={(v) => set("line", v as "descubra" | "viagens")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lineOpts.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="persona">Personalidade e instruções</Label>
              <Textarea
                id="persona"
                rows={6}
                value={form.persona}
                onChange={(e) => set("persona", e.target.value)}
                placeholder="Quem é o atendente, o que ele faz, o que nunca deve fazer."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tom de voz</Label>
                <Select value={form.tom} onValueChange={(v) => set("tom", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Criatividade das respostas</Label>
                <Slider
                  value={[form.criatividade]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={([v]) => set("criatividade", v ?? 0.6)}
                />
                <p className="text-xs text-muted-foreground">
                  {form.criatividade <= 0.3
                    ? "Respostas mais previsíveis e diretas"
                    : form.criatividade >= 0.8
                      ? "Respostas mais livres e criativas"
                      : "Equilíbrio entre precisão e naturalidade"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Gênero do agente</Label>
                <Select
                  value={form.agent_gender}
                  onValueChange={(v) => {
                    const g = v as "male" | "female";
                    setForm((f) => ({
                      ...f,
                      agent_gender: g,
                      tts_voice_profile: g,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Feminino</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Como o agente se refere a si nas respostas.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Voz no WhatsApp (áudio)</Label>
                <Select
                  value={form.tts_voice_profile}
                  onValueChange={(v) =>
                    set("tts_voice_profile", v as "male" | "female")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Voz masculina Guatá</SelectItem>
                    <SelectItem value="female">Voz feminina Guatá</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Quando o cliente manda nota de voz. No chat ele pode pedir
                  &quot;voz masculina&quot; ou &quot;voz feminina&quot;.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="saudacao">Saudação inicial</Label>
                <Textarea
                  id="saudacao"
                  rows={3}
                  value={form.saudacao}
                  onChange={(e) => set("saudacao", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="despedida">Mensagem de encerramento</Label>
                <Textarea
                  id="despedida"
                  rows={3}
                  value={form.despedida}
                  onChange={(e) => set("despedida", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="palavras">
                Palavras que transferem para atendimento humano
              </Label>
              <Input
                id="palavras"
                value={form.palavras_humano.join(", ")}
                onChange={(e) =>
                  set(
                    "palavras_humano",
                    e.target.value
                      .split(",")
                      .map((w) => w.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="humano, atendente, consultor"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Usar a base de conhecimento própria</p>
                  <p className="text-xs text-muted-foreground">
                    Documentos, textos e links anexados no painel.
                  </p>
                </div>
                <Switch
                  checked={form.usa_base_local}
                  onCheckedChange={(v) => set("usa_base_local", v)}
                />
              </div>
              {orgUi.useDescubraKb && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Usar a base do Descubra MS</p>
                    <p className="text-xs text-muted-foreground">
                      Perguntas, respostas e eventos oficiais do estado.
                    </p>
                  </div>
                  <Switch
                    checked={form.usa_base_descubra}
                    onCheckedChange={(v) => set("usa_base_descubra", v)}
                  />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Atendente ativo</p>
                  <p className="text-xs text-muted-foreground">
                    Só um atendente ativo por linha responde no WhatsApp.
                  </p>
                </div>
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => set("ativo", v)}
                />
              </div>
              {audioLoading && <Skeleton className="h-14 w-full" />}
              {audioSettings && (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Permitir respostas em áudio</p>
                      <p className="text-xs text-muted-foreground">
                        Add-on: o bot responde em voz quando o cliente manda{" "}
                        <em>nota de voz</em>; em texto, responde escrito.
                        {audioSettings.allowBotAudio && (
                          <>
                            {" "}
                            Uso no mês: {audioSettings.audioCountThisMonth}
                            {audioSettings.monthlyCap !== null
                              ? ` / ${audioSettings.monthlyCap}`
                              : ""}
                            .
                          </>
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={audioAllow}
                      disabled={!audioSettings.canEdit}
                      onCheckedChange={setAudioAllow}
                    />
                  </div>
                  {!audioSettings.canEdit && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 px-1">
                      Add-on de voz: solicite à Guatá para liberar o pacote de áudios.
                    </p>
                  )}
                  {audioAllow && audioSettings.canEdit && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Áudio ilimitado no mês</p>
                          <p className="text-xs text-muted-foreground">
                            Desligue para pacote mensal (ex.: 500 áudios).
                          </p>
                        </div>
                        <Switch
                          checked={audioUnlimited}
                          onCheckedChange={setAudioUnlimited}
                        />
                      </div>
                      {!audioUnlimited && (
                        <div className="space-y-2 rounded-lg border p-3">
                          <Label>Limite de áudios por mês</Label>
                          <Input
                            type="number"
                            min={0}
                            value={audioCap}
                            onChange={(e) => setAudioCap(e.target.value)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.nome.trim()}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar atendente"}
              </Button>
              {form.id && (
                <Button
                  variant="outline"
                  onClick={() => deleteMutation.mutate(form.id!)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
