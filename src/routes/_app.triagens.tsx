import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { TriagemStatusBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CONSULTORES, type TriagemStatus } from "@/types/guata";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/triagens")({
  component: TriagensPage,
});

function TriagensPage() {
  const [status, setStatus] = useState<TriagemStatus | "all">("all");
  const [line, setLine] = useState<string>("all");
  const [consultor, setConsultor] = useState<string>("all");
  const [destino, setDestino] = useState("");

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["triages", { status, line, consultor, destino }],
    queryFn: () => api.listTriages({ status, line, consultor, destino }),
  });

  const assumeMut = useMutation({
    mutationFn: ({ id, who }: { id: string; who: string }) =>
      api.assumeTriage(id, who),
    onSuccess: () => {
      toast.success("Triagem assumida");
      qc.invalidateQueries({ queryKey: ["triages"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Erro ao assumir triagem"),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">
          Triagens — Guatá Viagens
        </h1>
        <p className="text-muted-foreground">
          Fila de leads coletados pelo bot e prontos para o consultor humano.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as TriagemStatus | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="novo">Novo</SelectItem>
              <SelectItem value="atribuido">Atribuído</SelectItem>
              <SelectItem value="contactado">Contactado</SelectItem>
              <SelectItem value="proposta_enviada">Proposta enviada</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
              <SelectItem value="perdido">Perdido</SelectItem>
            </SelectContent>
          </Select>
          <Select value={line} onValueChange={setLine}>
            <SelectTrigger>
              <SelectValue placeholder="Linha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as linhas</SelectItem>
              <SelectItem value="descubra_ms">Descubra MS</SelectItem>
              <SelectItem value="guata_viagens">Guatá Viagens</SelectItem>
            </SelectContent>
          </Select>
          <Select value={consultor} onValueChange={setConsultor}>
            <SelectTrigger>
              <SelectValue placeholder="Consultor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos consultores</SelectItem>
              {CONSULTORES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filtrar destino..."
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Datas</TableHead>
              <TableHead>Viajantes</TableHead>
              <TableHead>Linha</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Consultor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-8" />
                    </TableCell>
                  </TableRow>
                ))
              : data?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">
                      {t.protocol}
                    </TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.destino}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(t.dataIda)} → {formatDate(t.dataVolta)}
                    </TableCell>
                    <TableCell>{t.viajantes}</TableCell>
                    <TableCell>
                      <LineBadge line={t.line} />
                    </TableCell>
                    <TableCell>
                      <TriagemStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.assignedTo ?? (
                        <span className="text-muted-foreground italic">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link to="/triagens/$id" params={{ id: t.id }}>
                          Ver
                        </Link>
                      </Button>
                      {t.status === "novo" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            assumeMut.mutate({ id: t.id, who: CONSULTORES[0] })
                          }
                        >
                          Assumir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!isLoading && data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-10"
                >
                  Nenhuma triagem com os filtros atuais.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}