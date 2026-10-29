import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { inviteOrgTeamMember, listOrgTeam } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/equipe")({
  head: () => ({
    meta: [{ title: "Equipe — consultores humanos | Guatá Channel" }],
  }),
  component: EquipePage,
});

function EquipePage() {
  const qc = useQueryClient();
  const load = useServerFn(listOrgTeam);
  const invite = useServerFn(inviteOrgTeamMember);

  const { data, isLoading, error } = useQuery({
    queryKey: ["org-team"],
    queryFn: () => load(),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { name, email, password } }),
    onSuccess: () => {
      toast.success("Consultor adicionado — envie o e-mail e a senha inicial.");
      setName("");
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["org-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return (
      <div className="max-w-2xl">
        <Card className="rounded-2xl border-destructive">
          <CardContent className="p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Sem permissão"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">Equipe — acesso humano</h1>
        <p className="text-muted-foreground mt-1">
          Pessoas da sua agência que entram no painel para conversas, triagens e conhecimento. O
          atendimento automático no WhatsApp fica em{" "}
          <Link to="/atendentes" className="text-primary underline">
            Atendente virtual (IA)
          </Link>
          .
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-base">Convidar consultor</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name || !email || password.length < 8) {
                toast.error("Preencha nome, e-mail e senha (mín. 8 caracteres).");
                return;
              }
              inviteMut.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="eq-name">Nome</Label>
              <Input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-email">E-mail</Label>
              <Input
                id="eq-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-pw">Senha inicial</Label>
              <Input
                id="eq-pw"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mín. 8 caracteres"
              />
            </div>
            <Button type="submit" disabled={inviteMut.isPending}>
              {inviteMut.isPending ? "Salvando..." : "Adicionar consultor"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            Se o e-mail já existir no sistema, a pessoa só é vinculada à sua agência (mesma senha de
            antes).
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-base">Quem tem acesso</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Na agência</TableHead>
                  <TableHead>Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.members ?? []).map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-xs">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.orgRole}</Badge>
                    </TableCell>
                    <TableCell>
                      {m.mustChangePassword ? (
                        <Badge variant="outline">trocar senha</Badge>
                      ) : (
                        <Badge variant="secondary">ativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.members?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Ninguém vinculado ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
