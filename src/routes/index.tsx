import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Guatá Channel — Atendimento e viagens" },
    { name: "description", content: "Central de atendimento, planejamento e reservas da Guatá Channel." },
    { property: "og:title", content: "Guatá Channel — Atendimento e viagens" },
    { property: "og:description", content: "Converse com viajantes e acompanhe o atendimento da sua agência." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const { loading, session } = useAuth();
  if (loading) return null;
  return <Navigate to={session ? "/dashboard" : "/login"} />;
}
