import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchQuoteValidity } from "@/lib/passhub.functions";
import { formatFlightQuote, type FlightQuoteOption } from "@/lib/quote-format";
import { reservationDataRequest } from "@/lib/reservation-rules";

const emptyOption = (): FlightQuoteOption => ({
  airline: "",
  flight: "",
  departure: "",
  arrival: "",
  duration: "",
  priceNoBag: "",
  priceWithBag: "",
});

/** Gerador rápido no padrão da agência: 3 opções, prazo de pagamento e aviso de alteração. */
export function QuoteBuilder({ onUseMessage }: { onUseMessage: (t: string) => void }) {
  const fetchValidity = useServerFn(fetchQuoteValidity);
  const { data } = useQuery({ queryKey: ["quote-validity"], queryFn: () => fetchValidity() });
  const [route, setRoute] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [validity, setValidity] = useState(15);
  const [options, setOptions] = useState<FlightQuoteOption[]>([emptyOption(), emptyOption(), emptyOption()]);

  useEffect(() => {
    if (data?.minutes) setValidity(data.minutes);
  }, [data?.minutes]);

  const setOpt = (i: number, k: keyof FlightQuoteOption, v: string) =>
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, [k]: v } : o)));

  const ready = options.filter((o) => o.airline.trim() && o.priceNoBag.trim()).length;

  return (
    <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Trecho (ex.: CGR ➔ SSA)" value={route} onChange={(e) => setRoute(e.target.value)} />
        <Input placeholder="Data (ex.: 15 de novembro)" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="space-y-1">
          <Label className="text-xs">Passageiros</Label>
          <Input type="number" min={1} value={passengers} onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Prazo p/ pagamento (min)</Label>
          <Input type="number" min={5} max={120} value={validity} onChange={(e) => setValidity(Number(e.target.value) || 15)} />
        </div>
      </div>
      {options.map((o, i) => (
        <div key={i} className="rounded-xl border bg-background/60 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Opção {i + 1}</div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Cia (Gol, Azul…)" value={o.airline} onChange={(e) => setOpt(i, "airline", e.target.value)} />
            <Input placeholder="Voo" value={o.flight} onChange={(e) => setOpt(i, "flight", e.target.value)} />
            <Input placeholder="Saída 15:00" value={o.departure} onChange={(e) => setOpt(i, "departure", e.target.value)} />
            <Input placeholder="Chegada 16:25" value={o.arrival} onChange={(e) => setOpt(i, "arrival", e.target.value)} />
            <Input placeholder="Duração 1h25" value={o.duration} onChange={(e) => setOpt(i, "duration", e.target.value)} />
            <div />
            <Input placeholder="Sem bagagem R$" value={o.priceNoBag} onChange={(e) => setOpt(i, "priceNoBag", e.target.value)} />
            <Input placeholder="Com bagagem R$" value={o.priceWithBag} onChange={(e) => setOpt(i, "priceWithBag", e.target.value)} />
          </div>
        </div>
      ))}
      <Button
        className="w-full"
        disabled={ready === 0}
        onClick={() =>
          onUseMessage(formatFlightQuote({ route, date, passengers, options, validityMinutes: validity }))
        }
      >
        Usar como resposta ({ready} de 3 opções)
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => onUseMessage(reservationDataRequest(passengers))}
      >
        Cliente fechou? Pedir dados da reserva
      </Button>
    </div>
  );
}
