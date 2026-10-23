import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  addOrgMember,
  createPartnerOrg,
  fetchMyOrganizations,
} from "@/lib/organizations.functions";

export const Route = createFileRoute("/_app/organizacoes")({
  component: OrganizacoesPage,
});

function OrganizacoesPage() {
  const qc = useQueryClient();
  const load = useServerFn(fetchMyOrganizations);
  const create = useServerFn(createPartnerOrg);
  const addMember = useServerFn(addOrgMember);

  const { data, isLoading } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => load(),
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberOrgId, setMemberOrgId] = useState("");

  const createMut = useMutation({
    mutationFn: () => create({ data: { name, slug } }),
    onSuccess: () => {
      toast.success("Agência parceira criada");
      setName("");
      setSlug("");
      qc.invalidateQueries({ queryKey: ["my-organizations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberMut = useMutation({
    mutationFn: () =>
      addMember({
        data: { organizationId: memberOrgId, userId: memberUserId, role: "admin" },
      }),
    onSuccess: () => {
      toast.success("Membro vinculado");
      setMemberUserId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  if (!data.canManagePartners) {
    return (
      <div className="max-w-lg mx-auto space-y-3">
        <h1 className="font-display text-2xl font-semibold text-primary">Organização</h1>
        <p className="text-sm text-muted-foreground">
          Você está na organização ativa selecionada no topo do painel. Para trocar, use o seletor no
          cabeçalho (quando tiver acesso a mais de uma).
        </p>
        <Button asChild variant="outline">
          <Link to="/conectar-meta">Conectar WhatsApp da sua agência</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">Agências parceiras</h1>
        <p className="text-sm text-muted-foreground">
          Preferencial: o parceiro usa <strong>Solicitar cadastro</strong> e você aprova em{" "}
          <Link to="/solicitacoes" className="text-primary underline">Solicitações</Link>. Use esta
          página só para criar org manualmente ou vincular usuário. WhatsApp:{" "}
          <Link to="/conectar-meta" className="text-primary underline">Conectar WhatsApp</Link>.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Nova agência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Nome comercial</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agência Exemplo" />
          </div>
          <div className="space-y-1">
            <Label>Slug (URL interna)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="agencia-exemplo"
            />
          </div>
          <Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            Criar organização
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Vincular usuário existente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Use o UUID do usuário (tela Usuários). Depois ele troca a org no cabeçalho.
          </p>
          <div className="space-y-1">
            <Label>ID da organização</Label>
            <Input value={memberOrgId} onChange={(e) => setMemberOrgId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ID do usuário</Label>
            <Input value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} />
          </div>
          <Button disabled={memberMut.isPending} onClick={() => memberMut.mutate()}>
            Adicionar como admin da org
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Organizações</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {data.organizations.map((o) => (
            <div key={o.id} className="flex justify-between border-b border-border/50 py-2">
              <span>{o.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{o.slug}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
