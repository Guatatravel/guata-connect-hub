import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Plane,
  MessageSquare,
  Settings,
  LogOut,
  Users,
  BookOpen,
  Bot,
  Link2,
  Building2,
  ClipboardList,
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { BrandLogo } from "@/components/guata/brand-logo";

type SidebarGate = {
  isGlobalAdmin?: boolean;
  canManagePartners?: boolean;
  canManageOrgTeam?: boolean;
  organizationName?: string;
};

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/triagens", label: "Triagens das Mensagens", icon: Plane, badgeKey: "triagensAbertas" as const },
  { to: "/conversas", label: "Conversas", icon: MessageSquare, badgeKey: "conversasHumano" as const },
  { to: "/conhecimento", label: "Conhecimento e disparos", icon: BookOpen },
  { to: "/conectar-meta", label: "Conectar WhatsApp", icon: Link2 },
  { to: "/atendentes", label: "Atendente virtual (IA)", icon: Bot },
  { to: "/equipe", label: "Equipe (humanos)", icon: Users, orgTeamOnly: true },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
  { to: "/solicitacoes", label: "Solicitações", icon: ClipboardList, adminOnly: true },
  { to: "/organizacoes", label: "Agências", icon: Building2, guataOpsOnly: true },
  { to: "/usuarios", label: "Usuários (Guatá)", icon: Users, adminOnly: true },
] as const;

type Counts = { triagensAbertas: number; conversasHumano: number };

function filterNav(gate?: SidebarGate) {
  return navItems.filter((item) => {
    if ("adminOnly" in item && item.adminOnly && !gate?.isGlobalAdmin) return false;
    if ("guataOpsOnly" in item && item.guataOpsOnly && !gate?.canManagePartners) return false;
    if ("orgTeamOnly" in item && item.orgTeamOnly && !gate?.canManageOrgTeam) return false;
    return true;
  });
}

export function AppSidebar({
  counts,
  gate,
}: {
  counts?: Counts;
  gate?: SidebarGate;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const items = filterNav(gate);

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3">
          <BrandLogo className="h-10 w-10 text-xl" />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sidebar-foreground leading-tight">
              Guatá Channel
            </span>
            <span className="text-xs text-sidebar-foreground/70 truncate">
              {gate?.organizationName ?? "Painel"}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const badgeCount =
                  "badgeKey" in item && counts
                    ? counts[item.badgeKey as keyof Counts]
                    : 0;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.to)}
                    >
                      <Link to={item.to} className="flex items-center gap-2 w-full">
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
