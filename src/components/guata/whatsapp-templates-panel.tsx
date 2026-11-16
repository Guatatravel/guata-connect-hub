import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, FileText } from "lucide-react";
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

const STATUS_COLOR: Record<string, string> = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
};

export function WhatsappTemplatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsappTemplatesFn);
  const syncFn = useServerFn(syncWhatsappTemplatesFn);
  const createFn = useServerFn(createWhatsappTemplateFn);
  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [bodyText, setBodyText] = useState("");

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizados ${r.count} modelos da Meta`);
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: { name, language, category, bodyText },
      }),
    onSuccess: () => {
      toast.success("Modelo enviado à Meta para análise");
      setName("");
      setBodyText("");
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Modelos WhatsApp (Meta)
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncMut.isPending}
          onClick={() => syncMut.mutate()}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
          Sincronizar com a Meta
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Crie ou sincronize modelos aprovados na Meta. Use{" "}
          <code className="text-xs">{"{{1}}"}</code> no texto para o primeiro nome na campanha.
        </p>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando modelos…</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
            {(data ?? []).length === 0 ? (
              <li className="text-muted-foreground text-xs">Nenhum modelo salvo. Sincronize ou crie um abaixo.</li>
            ) : (
              (data ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs border-b last:border-0 pb-2">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant={(STATUS_COLOR[t.status] as "default" | "secondary" | "destructive") ?? "outline"}>
                    {t.status}
                  </Badge>
                  <span className="text-muted-foreground">{t.language}</span>
                </li>
              ))
            )}
          </ul>
        )}

        <div className="grid sm:grid-cols-2 gap-3 border-t pt-4">
          <div className="space-y-1">
            <Label>Nome (snake_case)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="convite_evento" />
          </div>
          <div className="space-y-1">
            <Label>Idioma</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_BR" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Categoria</Label>
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
            <Label>Texto do corpo</Label>
            <Textarea
              rows={3}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Olá {{1}}, temos uma novidade para você!"
            />
          </div>
          <Button
            className="sm:col-span-2"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Enviando…" : "Enviar modelo para análise da Meta"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}