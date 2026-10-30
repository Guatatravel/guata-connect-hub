import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/guata/app-sidebar";
import { OrgSwitcher } from "@/components/guata/org-switcher";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { fetchPanelAccessGate } from "@/lib/organizations.functions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, user } = useAuth();
  const loadGate = useServerFn(fetchPanelAccessGate);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: gate, isLoading: gateLoading } = useQuery({
    queryKey: ["panel-access-gate"],
    queryFn: () => loadGate(),
    enabled: Boolean(user?.id),
  });

  if (loading || (user && gateLoading)) return null;
  if (!user) return <Navigate to="/login" />;
  if (profile?.must_change_password) return <Navigate to="/trocar-senha" />;
  if (gate?.hasOrganization === false) return <Navigate to="/sem-agencia" />;
  if (gate && !gate.accessLiberado) return <Navigate to="/aguardando-liberacao" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppLayoutInner gate={gate} />
      </div>
    </SidebarProvider>
  );
}

function AppLayoutInner({
  gate,
}: {
  gate?: {
    organizationName?: string;
    isGlobalAdmin?: boolean;
    canManagePartners?: boolean;
    canManageOrgTeam?: boolean;
  };
}) {
  const counts = useRealtimeNotifications();
  return (
    <>
        <AppSidebar counts={counts} gate={gate} />
        <SidebarInset>
          <header className="h-14 flex items-center gap-2 border-b border-border/70 bg-card/50 px-4 sticky top-0 z-10 backdrop-blur">
            <SidebarTrigger />
            <div className="font-display text-lg font-semibold text-primary hidden sm:block">
              Guatá Channel
            </div>
            {gate?.organizationName && (
              <span className="text-xs text-muted-foreground truncate max-w-[40vw] sm:max-w-none">
                · {gate.organizationName}
              </span>
            )}
            <div className="ml-auto shrink-0">
              <OrgSwitcher />
            </div>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </SidebarInset>
    </>
  );
}