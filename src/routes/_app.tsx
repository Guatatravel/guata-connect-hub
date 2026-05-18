import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/guata/app-sidebar";
import { getSession } from "@/lib/auth";
import { isUsingMock } from "@/lib/api/client";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getSession()));
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (import.meta.env.PROD && isUsingMock) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold text-destructive">
            Configuração ausente
          </h1>
          <p className="text-sm text-muted-foreground">
            Este painel não pode ser executado em produção sem uma API real.
            Defina <code>VITE_GUATA_API_URL</code> antes de publicar.
          </p>
        </div>
      </div>
    );
  }
  if (!authed) return <Navigate to="/login" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center gap-2 border-b border-border/70 bg-card/50 px-4 sticky top-0 z-10 backdrop-blur">
            <SidebarTrigger />
            <div className="font-display text-lg font-semibold text-primary">
              Guatá Channel
            </div>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}