import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BookOpen, FileText, ImageIcon, Link2, Megaphone, Trash2, Upload, Type } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CampaignsTab } from "@/components/guata/campaigns-tab";
import {
  listKnowledge,
  addKnowledgeTextDoc,
  addKnowledgeLinkDoc,
  addKnowledgeFileDoc,
  removeKnowledgeDoc,
  addKnowledgeWhatsAppImageDoc,
} from "@/lib/knowledge.functions";

export const Route = createFileRoute("/_app/conhecimento")({
  component: Conhecimento,
  head: () => ({
    meta: [
      { title: "Conhecimento e disparos | Guatá Channel" },
      {
        name: "description",
        content:
          "Base de conhecimento para a IA e campanhas de disparo no WhatsApp.",
      },
      { property: "og:title", content: "Conhecimento e disparos | Guatá Channel" },
      {
        property: "og:description",
        content: "Ensine o Guatá e envie promoções para sua base de conversas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp";
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";
const MAX_BYTES = 8 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KnowledgeBasePanel() {
  const qc = useQueryClient();
  const fetchDocs = useServerFn(listKnowledge);
  const addText = useServerFn(addKnowledgeTextDoc);
  const addLink = useServerFn(addKnowledgeLinkDoc);
  const addFile = useServerFn(addKnowledgeFileDoc);
  const addImage = useServerFn(addKnowledgeWhatsAppImageDoc);
  const removeDoc = useServerFn(removeKnowledgeDoc);

  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imgTitle, setImgTitle] = useState("");
  const [imgDesc, setImgDesc] = useState("");
  const [imgKeywords, setImgKeywords] = useState("");
  const [imgCaption, setImgCaption] = useState("");
  const [imgSendable, setImgSendable] = useState(true);
  const [imgFile, setImgFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => fetchDocs(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge"] });
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível concluir");

  const textMutation = useMutation({
    mutationFn: () => addText({ data: { title: textTitle, content: textBody } }),
    onSuccess: () => {
      toast.success("Texto adicionado à base de conhecimento");
      setTextTitle("");
      setTextBody("");
      invalidate();
    },
    onError,
  });

  const linkMutation = useMutation({
    mutationFn: () => addLink({ data: { title: linkTitle, url: linkUrl } }),
    onSuccess: () => {
      toast.success("Link importado");
      setLinkTitle("");
      setLinkUrl("");
      invalidate();
    },
    onError,
  });

  const fileMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 8 MB");
      const base64 = await fileToBase64(file);
      return addFile({ data: { filename: file.name, base64, title: file.name } });
    },
    onSuccess: () => {
      toast.success("Arquivo processado e adicionado");
      invalidate();
    },
    onError,
  });

  const imageMutation = useMutation({
    mutationFn: async () => {
      if (!imgFile) throw new Error("Escolha uma imagem");
      if (imgFile.size > MAX_BYTES) throw new Error("Imagem maior que 8 MB");
      const base64 = await fileToBase64(imgFile);
      return addImage({
        data: {
          filename: imgFile.name,
          base64,
          title: imgTitle || imgFile.name,
          description: imgDesc,
          keywords: imgKeywords,
          caption: imgCaption,
          sendable: imgSendable,
        },
      });
    },
    onSuccess: () => {
      toast.success("Imagem cadastrada para o WhatsApp");
      setImgTitle("");
      setImgDesc("");
      setImgKeywords("");
      setImgCaption("");
      setImgFile(null);
      invalidate();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeDoc({ data: { id } }),
    onSuccess: () => {
      toast.success("Item removido");
      invalidate();
    },
    onError,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar conteúdo</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="arquivo">
            <TabsList>
              <TabsTrigger value="arquivo">
                <Upload className="h-4 w-4 mr-2" />
                Arquivo
              </TabsTrigger>
              <TabsTrigger value="texto">
                <Type className="h-4 w-4 mr-2" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="link">
                <Link2 className="h-4 w-4 mr-2" />
                Link
              </TabsTrigger>
              <TabsTrigger value="imagem">
                <ImageIcon className="h-4 w-4 mr-2" />
                Imagem WhatsApp
              </TabsTrigger>
            </TabsList>

            <TabsContent value="arquivo" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                PDF, Word, planilhas, texto ou imagens (PNG/JPG), até 8 MB. Imagens
                promocionais: use a aba &quot;Imagem WhatsApp&quot;.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) fileMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={fileMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {fileMutation.isPending ? "Processando..." : "Escolher arquivo"}
              </Button>
            </TabsContent>

            <TabsContent value="texto" className="space-y-3 pt-4">
              <div className="space-y-2">
                <Label htmlFor="titulo-texto">Título</Label>
                <Input
                  id="titulo-texto"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="Ex.: Política de cancelamento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="corpo-texto">Conteúdo</Label>
                <Textarea
                  id="corpo-texto"
                  rows={8}
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  placeholder="Cole aqui o texto que o atendente deve conhecer."
                />
              </div>
              <Button
                onClick={() => textMutation.mutate()}
                disabled={textMutation.isPending || !textBody.trim()}
              >
                {textMutation.isPending ? "Salvando..." : "Adicionar texto"}
              </Button>
            </TabsContent>

            <TabsContent value="link" className="space-y-3 pt-4">
              <div className="space-y-2">
                <Label htmlFor="titulo-link">Título</Label>
                <Input
                  id="titulo-link"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Ex.: Página de pacotes do site"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url-link">Endereço</Label>
                <Input
                  id="url-link"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <Button
                onClick={() => linkMutation.mutate()}
                disabled={linkMutation.isPending || !linkUrl.trim()}
              >
                {linkMutation.isPending ? "Importando..." : "Importar link"}
              </Button>
            </TabsContent>

            <TabsContent value="imagem" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                O bot pode enviar esta imagem na conversa quando o cliente pedir promoção ou
                usar palavras-chave que você definir (não é disparo em massa).
              </p>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={imgTitle}
                  onChange={(e) => setImgTitle(e.target.value)}
                  placeholder="Ex.: Black Friday Pantanal"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (a IA usa para decidir enviar)</Label>
                <Textarea
                  rows={3}
                  value={imgDesc}
                  onChange={(e) => setImgDesc(e.target.value)}
                  placeholder="O que é a promoção, validade, destino..."
                />
              </div>
              <div className="space-y-2">
                <Label>Palavras-chave (vírgula)</Label>
                <Input
                  value={imgKeywords}
                  onChange={(e) => setImgKeywords(e.target.value)}
                  placeholder="promoção, desconto, black friday"
                />
              </div>
              <div className="space-y-2">
                <Label>Legenda no WhatsApp (opcional)</Label>
                <Input
                  value={imgCaption}
                  onChange={(e) => setImgCaption(e.target.value)}
                  placeholder="Texto que aparece junto da imagem"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={imgSendable} onCheckedChange={setImgSendable} />
                <Label>Bot pode enviar automaticamente</Label>
              </div>
              <input
                ref={imageRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => imageRef.current?.click()}>
                  {imgFile ? imgFile.name : "Escolher imagem"}
                </Button>
                <Button
                  onClick={() => imageMutation.mutate()}
                  disabled={imageMutation.isPending || !imgFile}
                >
                  {imageMutation.isPending ? "Salvando..." : "Salvar imagem"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Conteúdos cadastrados {data ? `(${data.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              Nada por aqui ainda. Comece anexando um documento ou colando um texto.
            </p>
          )}
          {data?.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <FileText className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{doc.title}</span>
                  <Badge variant="outline">{doc.source_type}</Badge>
                  {doc.whatsapp_sendable && (
                    <Badge className="bg-emerald-600">envia no WhatsApp</Badge>
                  )}
                  {doc.status === "erro" ? (
                    <Badge variant="destructive">falhou</Badge>
                  ) : (
                    <Badge variant="secondary">pronto</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatSize(doc.size_bytes)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {doc.error ?? doc.preview ?? ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(doc.id)}
                disabled={deleteMutation.isPending}
                aria-label="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Conhecimento() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conhecimento e disparos</h1>
        <p className="text-muted-foreground text-sm">
          Na aba Base, ensine o Guatá. Na aba Disparos, envie promoções para quem já
          conversou no WhatsApp.
        </p>
      </div>

      <Tabs defaultValue="base" className="space-y-4">
        <TabsList>
          <TabsTrigger value="base">
            <BookOpen className="h-4 w-4 mr-2" />
            Base
          </TabsTrigger>
          <TabsTrigger value="disparos">
            <Megaphone className="h-4 w-4 mr-2" />
            Disparos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="base">
          <KnowledgeBasePanel />
        </TabsContent>
        <TabsContent value="disparos">
          <CampaignsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
