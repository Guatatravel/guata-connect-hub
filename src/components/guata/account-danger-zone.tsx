import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShieldAlert, Unplug, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteMyAccount, disconnectWhatsApp } from "@/lib/account.functions";
import { signOut } from "@/lib/auth";

export function AccountDangerZone() {
  const navigate = useNavigate();
  const disconnectFn = useServerFn(disconnectWhatsApp);
  const deleteFn = useServerFn(deleteMyAccount);
  const [confirm, setConfirm] = useState("");

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: (r) =>
      toast.success(
        r.channels > 0 ? "WhatsApp desconectado do Guatá Channel" : "Não havia WhatsApp conectado nesta agência",
      ),
    onError: (e: Error) => toast.error(e.message || "Não foi possível desconectar"),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { confirm: "EXCLUIR" as const } }),
    onSuccess: async () => {
      toast.success("Sua conta foi excluída");
      await signOut();
      navigate({ to: "/login" });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível excluir a conta"),
  });

  return (
    <Card className="rounded-2xl border-destructive/40">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" /> Conta e privacidade
        </CardTitle>
        <CardDescription>
          Seu número e sua conta na Meta continuam seus. Aqui você só tira o acesso do Guatá Channel. Para apagar a conta
          na Meta, faça isso no Gerenciador de Negócios da Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-4">
          <div className="flex-1 text-sm">
            <div className="font-medium">Desconectar WhatsApp</div>
            <div className="text-muted-foreground">
              O Guatá para de receber e responder. Apagamos o token e os dados de conexão da Meta e as chaves do Passhub.
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={disconnect.isPending}>
                <Unplug className="h-4 w-4 mr-1" /> Desconectar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  O Guatá deixa de atender por este número até você conectar de novo. As conversas ficam guardadas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => disconnect.mutate()}>Desconectar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-destructive/30 p-4">
          <div className="flex-1 text-sm">
            <div className="font-medium text-destructive">Excluir minha conta</div>
            <div className="text-muted-foreground">
              Apaga seu acesso. Se você for o único dono da agência, a agência e tudo dela (conversas, base, conexão
              com a Meta) também são apagados. Não dá para desfazer.
            </div>
          </div>
          <AlertDialog onOpenChange={() => setConfirm("")}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={remove.isPending}>
                <UserX className="h-4 w-4 mr-1" /> Excluir conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir sua conta de vez?</AlertDialogTitle>
                <AlertDialogDescription>
                  Primeiro desconectamos o WhatsApp da Meta, depois apagamos seus dados. Digite EXCLUIR para confirmar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="EXCLUIR" aria-label="Confirmação" />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirm.trim() !== "EXCLUIR"}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => remove.mutate()}
                >
                  Excluir definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
