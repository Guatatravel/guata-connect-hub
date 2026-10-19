import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/cotacoes")({
  head: () => ({
    meta: [
      { title: "Cotações e Comparador — Guatá Channel" },
      { name: "description", content: "Compare custos de fornecedores e defina a margem de venda." },
      { property: "og:title", content: "Cotações e Comparador — Guatá Channel" },
      { property: "og:description", content: "Compare custos de fornecedores e defina a margem de venda." },
    ],
  }),
  component: Cotacoes,
});

type Row = { id: number; fonte: string; descricao: string; custo: string };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Cotacoes() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, fonte: "Grupo Confiança", descricao: "Aéreo", custo: "" },
    { id: 2, fonte: "TBO Holidays", descricao: "Hotel", custo: "" },
    { id: 3, fonte: "Booking", descricao: "Hotel", custo: "" },
  ]);
  const [margem, setMargem] = useState("15");

  const valid = rows.map((r) => ({ ...r, v: Number(r.custo.replace(",", ".")) })).filter((r) => r.v > 0);
  const best = valid.length ? valid.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const m = Number(margem.replace(",", ".")) || 0;
  const venda = best ? best.v * (1 + m / 100) : 0;

  const update = (id: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">Cotações e Comparador</h1>
        <p className="text-sm text-muted-foreground">
          Uso interno: o cliente não vê. Lance os valores que você encontrou em cada fornecedor —
          o painel mostra a melhor opção e o preço de venda com a sua margem. A busca automática
          depende de acesso às APIs de cada fornecedor (futuro).
        </p>
      </div>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base">Fornecedores</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_140px_auto] gap-2 items-center">
              <Input value={r.fonte} placeholder="Fornecedor" onChange={(e) => update(r.id, "fonte", e.target.value)} />
              <Input value={r.descricao} placeholder="Item" onChange={(e) => update(r.id, "descricao", e.target.value)} />
              <Input
                value={r.custo}
                inputMode="decimal"
                placeholder="Custo R$"
                className={best?.id === r.id ? "border-primary ring-1 ring-primary" : ""}
                onChange={(e) => update(r.id, "custo", e.target.value)}
              />
              <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { id: Date.now(), fonte: "", descricao: "", custo: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar fornecedor
          </Button>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="text-sm text-muted-foreground">Margem (%)</label>
            <Input value={margem} inputMode="decimal" onChange={(e) => setMargem(e.target.value)} />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Melhor custo</div>
            <div className="text-lg font-semibold">{best ? `${brl(best.v)} · ${best.fonte}` : "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Preço de venda sugerido</div>
            <div className="text-2xl font-display font-semibold text-primary">{best ? brl(venda) : "—"}</div>
            {best && <div className="text-xs text-muted-foreground">Lucro: {brl(venda - best.v)}</div>}
          </div>
        </CardContent>
      </Card>
      {best && (
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(`Proposta Guatá: ${best.descricao} por ${brl(venda)}.`);
            toast.success("Proposta copiada");
          }}
        >
          <Copy className="h-4 w-4 mr-1" /> Copiar proposta para o cliente
        </Button>
      )}
    </div>
  );
}
