import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ImageIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createWhatsappTemplateFn,
  listWhatsappTemplatesFn,
  syncWhatsappTemplatesFn,
} from "@/lib/whatsapp-templates.functions";
import {
  TEMPLATE_BUTTON_LABEL,
  type TemplateButtonType,
  type TemplateHeaderMode,
} from "@/lib/whatsapp-templates.shared";

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  REJECTED: "Recusado",
};

type DraftButton = {
  type: TemplateButtonType;
  text: string;
  url: string;
  phoneNumber: string;
};

function fileToBase64(file: File): Promise<{ base64: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve({
        base64: result.slice(result.indexOf(",") + 1),
        type: file.type || "image/jpeg",
      });
    };
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  templateName: string;
  templateLanguage: string;
  templateUsesName: boolean;
  onSelect: (name: string, language: string, usesName: boolean) => void;
  onUsesNameChange: (v: boolean) => void;
};

/** Modelos Meta: cadastrar, sincronizar e escolher aprovado para enviar. */
export function WhatsappTemplateCampaignFields({
  templateName,
  templateLanguage,
  templateUsesName,
  onSelect,
  onUsesNameChange,
}: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsappTemplatesFn);
  const syncFn = useServerFn(syncWhatsappTemplatesFn);
  const createFn = useServerFn(createWhatsappTemplateFn);
  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listFn() });
  const headerImageRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [bodyText, setBodyText] = useState("");
  const [headerMode, setHeaderMode] = useState<TemplateHeaderMode>("none");
  const [headerText, setHeaderText] = useState("");
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<DraftButton[]>([
    { type: "URL", text: "Ver no site", url: "https://", phoneNumber: "" },
  ]);

  const approved = (data ?? []).filter((t) => t.status === "APPROVED");
  const pending = (data ?? []).filter((t) => t.status !== "APPROVED");
  const selectedApproved = approved.find(
    (t) => t.name === templateName && t.language === templateLanguage,
  );
  const selectValue =
    selectedApproved ? `${templateName}::${templateLanguage}` : "";

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(r.count ? `${r.count} modelo(s) da Meta` : "Nenhum modelo novo — confira se há aprovados na Meta");
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let headerImageBase64: string | undefined;
      let headerImageContentType: string | undefined;
      if (headerMode === "image" && headerImageFile) {
        const img = await fileToBase64(headerImageFile);
        headerImageBase64 = img.base64;
        headerImageContentType = img.type;
      }
      return createFn({
        data: {
          name,
          language,
          category,
          bodyText,
          headerMode,
          headerText: headerMode === "text" ? headerText : undefined,
          headerImageBase64,
          headerImageContentType,
          footerText: footerText || undefined,
          buttons: buttons
            .filter((b) => b.text.trim())
            .map((b) => ({
              type: b.type,
              text: b.text,
              url: b.type === "URL" ? b.url : undefined,
              phoneNumber: b.type === "PHONE_NUMBER" ? b.phoneNumber : undefined,
            })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Enviado à Meta. Quando aprovar, toque em Atualizar e escolha na lista.");
      setName("");
      setBodyText("");
      setFooterText("");
      setHeaderImageFile(null);
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "", url: "", phoneNumber: "" }]);
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-base font-medium">Modelo aprovado para envio</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncMut.isPending}
            onClick={() => syncMut.mutate()}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMut.isPending ? "animate-spin" : ""}`} />
            Atualizar da Meta
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando modelos…</p>
        ) : approved.length > 0 ? (
          <Select
            value={selectValue}
            onValueChange={(v) => {
              const [n, lang] = v.split("::");
              const picked = approved.find((t) => t.name === n && t.language === lang);
              onSelect(n, lang, Boolean(picked?.body_text.includes("{{1}}")));
            }}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Escolha um modelo aprovado" />
            </SelectTrigger>
            <SelectContent>
              {approved.map((t) => (
                <SelectItem key={t.id} value={`${t.name}::${t.language}`}>
                  {t.name} · {t.language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum modelo aprovado. Cadastre abaixo; quando a Meta aprovar, toque em Atualizar da Meta.
          </p>
        )}

        {selectedApproved && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-primary/90">Aprovado — pronto para disparar</Badge>
            <span className="text-xs text-muted-foreground">{selectedApproved.name}</span>
          </div>
        )}

        {templateName && selectedApproved && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={templateUsesName}
              onChange={(e) => onUsesNameChange(e.target.checked)}
            />
            O modelo usa nome na variável {"{{1}}"}
          </label>
        )}
      </div>

      {!isLoading && pending.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/5">
          <p className="text-xs font-medium text-muted-foreground">Na Meta (ainda não aprovados para envio)</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pending.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {STATUS_LABEL[t.status] ?? t.status}
                </Badge>
                <span>
                  {t.name} · {t.language}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-lg border bg-muted/10 p-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
          Cadastrar novo modelo na Meta
        </summary>
        <div className="mt-3 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome (snake_case)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="convite_evento" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Idioma</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="UTILITY">Utilidade</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Cabeçalho</Label>
            <Select value={headerMode} onValueChange={(v) => setHeaderMode(v as TemplateHeaderMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cabeçalho</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
              </SelectContent>
            </Select>
            {headerMode === "text" && (
              <Input
                className="mt-2"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Título curto (máx. 60)"
                maxLength={60}
              />
            )}
            {headerMode === "image" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={headerImageRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setHeaderImageFile(e.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => headerImageRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5 mr-1" />
                  {headerImageFile ? headerImageFile.name : "Imagem de amostra"}
                </Button>
                <span className="text-[10px] text-muted-foreground">JPG/PNG até 5 MB — a Meta usa na análise.</span>
              </div>
            )}
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Corpo da mensagem</Label>
            <Textarea
              rows={3}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Olá {{1}}, temos uma novidade!"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Rodapé (opcional)</Label>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Ex.: Guatá Viagens"
              maxLength={60}
            />
          </div>

          <div className="space-y-2 sm:col-span-2 border rounded-lg p-3 bg-background/50">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">Botões (até 3)</Label>
              <Button type="button" variant="ghost" size="sm" disabled={buttons.length >= 3} onClick={addButton}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Site + ligar no mesmo modelo, ou só respostas rápidas — a Meta não mistura os dois tipos.
            </p>
            {buttons.map((b, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 items-end border-t pt-2 mt-2">
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-[10px]">Tipo</Label>
                  <Select
                    value={b.type}
                    onValueChange={(v) => {
                      const type = v as TemplateButtonType;
                      setButtons((prev) => prev.map((row, j) => (j === i ? { ...row, type } : row)));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TEMPLATE_BUTTON_LABEL) as TemplateButtonType[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {TEMPLATE_BUTTON_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-[10px]">Rótulo</Label>
                  <Input
                    className="h-8 text-xs"
                    value={b.text}
                    maxLength={25}
                    onChange={(e) =>
                      setButtons((prev) => prev.map((row, j) => (j === i ? { ...row, text: e.target.value } : row)))
                    }
                  />
                </div>
                <div className="sm:col-span-4 space-y-1">
                  {b.type === "URL" && (
                    <>
                      <Label className="text-[10px]">URL (https)</Label>
                      <Input
                        className="h-8 text-xs"
                        value={b.url}
                        onChange={(e) =>
                          setButtons((prev) => prev.map((row, j) => (j === i ? { ...row, url: e.target.value } : row)))
                        }
                      />
                    </>
                  )}
                  {b.type === "PHONE_NUMBER" && (
                    <>
                      <Label className="text-[10px]">Telefone com DDI</Label>
                      <Input
                        className="h-8 text-xs"
                        value={b.phoneNumber}
                        placeholder="5567999999999"
                        onChange={(e) =>
                          setButtons((prev) =>
                            prev.map((row, j) => (j === i ? { ...row, phoneNumber: e.target.value } : row)),
                          )
                        }
                      />
                    </>
                  )}
                  {b.type === "QUICK_REPLY" && (
                    <p className="text-[10px] text-muted-foreground pb-1">Só o rótulo — a pessoa toca e responde.</p>
                  )}
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={buttons.length <= 1}
                    onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            className="sm:col-span-2"
            disabled={createMut.isPending || !bodyText.trim() || !name.trim()}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Enviando…" : "Enviar para análise da Meta"}
          </Button>
        </div>
        </div>
      </details>
    </div>
  );
}