import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
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
import {
  BookOpen,
  FileText,
  ImageIcon,
  Link2,
  Megaphone,
  Pencil,
  Trash2,
  Upload,
  Type,
  Search,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CampaignsTab } from "@/components/guata/campaigns-tab";
import {
  isKnowledgePdf,
  matchesKnowledgeListFilter,
  type KnowledgeListFilter,
} from "@/lib/knowledge-doc-ui";
import {
  listKnowledge,
  addKnowledgeTextDoc,
  addKnowledgeLinkDoc,
  addKnowledgeFileDoc,
  removeKnowledgeDoc,
  addKnowledgeWhatsAppImageDoc,
  updateKnowledgeDoc,
  getKnowledgeFileUrl,
} from "@/lib/knowledge.functions";

type EditDoc = {
  id: string;
  title: string;
  source_type: string;
  url: string | null;
  content: string;
  preview: string;
  whatsapp_sendable: boolean;
  send_keywords: string[];
  whatsapp_caption: string | null;
};

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
  const updateDoc = useServerFn(updateKnowledgeDoc);
  const removeDoc = useServerFn(removeKnowledgeDoc);
  const fetchFileUrl = useServerFn(getKnowledgeFileUrl);

  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKeywords, setLinkKeywords] = useState("");
  const [linkSendable, setLinkSendable] = useState(true);
  const [editing, setEditing] = useState<EditDoc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editSendable, setEditSendable] = useState(false);
  const [editRefreshLink, setEditRefreshLink] = useState(false);
  const [editReplaceImage, setEditReplaceImage] = useState<File | null>(null);
  const [imgTitle, setImgTitle] = useState("");
  const [imgDesc, setImgDesc] = useState("");
  const [imgKeywords, setImgKeywords] = useState("");
  const [imgCaption, setImgCaption] = useState("");
  const [imgSendable, setImgSendable] = useState(true);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [filePdfSendable, setFilePdfSendable] = useState(false);
  const [filePdfKeywords, setFilePdfKeywords] = useState("");
  const [filePdfCaption, setFilePdfCaption] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [listFilter, setListFilter] = useState<KnowledgeListFilter>("all");

  const LIST_FILTERS: { id: KnowledgeListFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "link", label: "Links" },
    { id: "pdf", label: "PDFs" },
    { id: "imagem", label: "Imagens" },
    { id: "texto", label: "Textos" },
    { id: "arquivo", label: "Outros arquivos" },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => fetchDocs(),
  });

  const filteredDocs = useMemo(() => {
    if (!data) return [];
    let rows = data.filter((doc) =>
      matchesKnowledgeListFilter(
        { source_type: doc.source_type, title: doc.title },
        listFilter,
      ),
    );
    const q = listSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((doc) => {
      const hay = [
        doc.title,
        doc.preview,
        doc.url ?? "",
        doc.source_type,
        ...(doc.send_keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, listSearch, listFilter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge"] });
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível concluir");

  const openStoredFile = async (docId: string) => {
    try {
      const { url } = await fetchFileUrl({ data: { id: docId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError(e);
    }
  };

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
    mutationFn: () =>
      addLink({
        data: {
          title: linkTitle,
          url: linkUrl,
          keywords: linkKeywords,
          sendable: linkSendable,
        },
      }),
    onSuccess: () => {
      toast.success("Link importado");
      setLinkTitle("");
      setLinkUrl("");
      setLinkKeywords("");
      invalidate();
    },
    onError,
  });

  const openEdit = (doc: EditDoc) => {
    setEditing(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content || doc.preview);
    setEditUrl(doc.url ?? "");
    setEditKeywords(doc.send_keywords.join(", "));
    setEditCaption(doc.whatsapp_caption ?? "");
    setEditSendable(doc.whatsapp_sendable);
    setEditRefreshLink(false);
    setEditReplaceImage(null);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const payload: Record<string, unknown> = {
        id: editing.id,
        title: editTitle,
      };
      if (editing.source_type === "texto") payload.content = editContent;
      if (editing.source_type === "link") {
        payload.url = editUrl;
        payload.content = editContent;
        payload.keywords = editKeywords;
        payload.sendable = editSendable;
        payload.refreshLink = editRefreshLink;
      }
      if (editing.source_type === "imagem") {
        payload.content = editContent;
        payload.keywords = editKeywords;
        payload.caption = editCaption;
        payload.sendable = editSendable;
        if (editReplaceImage) {
          payload.imageBase64 = await fileToBase64(editReplaceImage);
          payload.imageFilename = editReplaceImage.name;
        }
      }
      if (editing.source_type === "arquivo") {
        payload.sendable = editSendable;
        payload.keywords = editKeywords;
        payload.caption = editCaption;
        if (isKnowledgePdf({ source_type: editing.source_type, title: editing.title })) {
          payload.content = editContent;
        }
      }
      return updateDoc({ data: payload as never });
    },
    onSuccess: () => {
      toast.success("Conteúdo atualizado");
      setEditing(null);
      invalidate();
    },
    onError,
  });

  const fileMutation = useMutation({
    mutationFn: async () => {
      if (!pendingFile) throw new Error("Escolha um arquivo primeiro");
      if (pendingFile.size > MAX_BYTES) throw new Error("Arquivo maior que 8 MB");
      const base64 = await fileToBase64(pendingFile);
      const isPdf = pendingFile.name.toLowerCase().endsWith(".pdf");
      const title = fileTitle.trim() || pendingFile.name;
      return addFile({
        data: {
          filename: pendingFile.name,
          base64,
          title,
          ...(isPdf
            ? {
                sendable: filePdfSendable,
                keywords: filePdfKeywords,
                caption: filePdfCaption,
                description: fileDescription.trim(),
              }
            : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Arquivo processado e adicionado");
      setPendingFile(null);
      setFileTitle("");
      setFileDescription("");
      setFilePdfSendable(false);
      setFilePdfKeywords("");
      setFilePdfCaption("");
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
                PDF, Word, planilhas ou texto, até 8 MB. Escolha o arquivo, preencha o
                título e envie. Imagens promocionais: aba &quot;Imagem WhatsApp&quot;.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPendingFile(file);
                    setFileTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
                  }
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Escolher arquivo
              </Button>
              {pendingFile && (
                <p className="text-sm text-muted-foreground">
                  Arquivo: <span className="font-medium text-foreground">{pendingFile.name}</span>{" "}
                  ({formatSize(pendingFile.size)})
                </p>
              )}
              <div className="space-y-2">
                <Label>Título na base</Label>
                <Input
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder="Ex.: Mapa turístico Campo Grande 2025"
                />
              </div>
              {pendingFile?.name.toLowerCase().endsWith(".pdf") && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs font-medium text-primary">PDF no WhatsApp (opcional)</p>
                  <div className="space-y-2">
                    <Label>Descrição para a IA</Label>
                    <Textarea
                      rows={2}
                      value={fileDescription}
                      onChange={(e) => setFileDescription(e.target.value)}
                      placeholder="Ex.: Mapa turístico oficial de Campo Grande — pontos culturais e parques."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={filePdfSendable} onCheckedChange={setFilePdfSendable} />
                    <Label>Enviar PDF ao cliente quando relevante</Label>
                  </div>
                  {filePdfSendable && (
                    <>
                      <Input
                        value={filePdfKeywords}
                        onChange={(e) => setFilePdfKeywords(e.target.value)}
                        placeholder="Palavras-chave (vírgula): mapa, campo grande"
                      />
                      <Input
                        value={filePdfCaption}
                        onChange={(e) => setFilePdfCaption(e.target.value)}
                        placeholder="Legenda no WhatsApp (opcional)"
                      />
                    </>
                  )}
                </div>
              )}
              <Button
                onClick={() => fileMutation.mutate()}
                disabled={fileMutation.isPending || !pendingFile}
              >
                {fileMutation.isPending ? "Processando..." : "Enviar para a base"}
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
              <div className="space-y-2">
                <Label>Palavras-chave (vírgula)</Label>
                <Input
                  value={linkKeywords}
                  onChange={(e) => setLinkKeywords(e.target.value)}
                  placeholder="vídeo, bonito, pantanal"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={linkSendable} onCheckedChange={setLinkSendable} />
                <Label>Bot pode enviar o link no WhatsApp quando relevante</Label>
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

      {editing && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span>Editar: {editing.title}</span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            {editing.source_type === "texto" && (
              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea rows={8} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
              </div>
            )}
            {editing.source_type === "link" && (
              <>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Texto de apoio (opcional)</Label>
                  <Textarea rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Palavras-chave</Label>
                  <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editSendable} onCheckedChange={setEditSendable} />
                  <Label>Enviar link no WhatsApp quando relevante</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editRefreshLink} onCheckedChange={setEditRefreshLink} />
                  <Label>Reimportar texto da página</Label>
                </div>
              </>
            )}
            {editing.source_type === "arquivo" &&
              isKnowledgePdf({ source_type: editing.source_type, title: editing.title }) && (
                <>
                  <div className="space-y-2">
                    <Label>Descrição para a IA</Label>
                    <Textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Palavras-chave</Label>
                    <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Legenda WhatsApp</Label>
                    <Input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editSendable} onCheckedChange={setEditSendable} />
                    <Label>Bot pode enviar este PDF no WhatsApp</Label>
                  </div>
                </>
              )}
            {editing.source_type === "imagem" && (
              <>
                <div className="space-y-2">
                  <Label>Descrição para a IA</Label>
                  <Textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Palavras-chave</Label>
                  <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Legenda WhatsApp</Label>
                  <Input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editSendable} onCheckedChange={setEditSendable} />
                  <Label>Bot pode enviar imagem</Label>
                </div>
                <div className="space-y-2">
                  <Label>Substituir imagem (opcional)</Label>
                  <Input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    onChange={(e) => setEditReplaceImage(e.target.files?.[0] ?? null)}
                  />
                </div>
              </>
            )}
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">
            Conteúdos cadastrados {data ? `(${filteredDocs.length}/${data.length})` : ""}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {LIST_FILTERS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={listFilter === f.id ? "default" : "outline"}
                onClick={() => setListFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Buscar por título, texto ou palavra-chave…"
              className="pl-9"
            />
          </div>
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
          {filteredDocs.map((doc) => (
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
                    <Badge className="bg-emerald-600">
                      {doc.source_type === "link"
                        ? "envia link"
                        : isKnowledgePdf({ source_type: doc.source_type, title: doc.title })
                          ? "envia PDF"
                          : "envia no WhatsApp"}
                    </Badge>
                  )}
                  {doc.url && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {doc.url}
                    </span>
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
                {doc.file_path &&
                  (isKnowledgePdf({
                    source_type: doc.source_type,
                    title: doc.title,
                    file_path: doc.file_path,
                  }) ||
                    doc.source_type === "imagem") && (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs mt-1"
                      onClick={() => openStoredFile(doc.id)}
                    >
                      {doc.source_type === "imagem" ? "Abrir imagem" : "Abrir PDF"}
                    </Button>
                  )}
                {doc.file_path && doc.size_bytes === 0 && doc.source_type === "arquivo" && (
                  <p className="text-xs text-amber-600 mt-1">
                    Arquivo pode estar ausente no storage — use Abrir PDF para conferir ou envie de novo.
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(doc as EditDoc)}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
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
