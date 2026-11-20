import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

function TriageToConversation() {
  const { id } = Route.useParams();
  const { data: triage } = useQuery({
    queryKey: ["triage", id],
    queryFn: () => api.getTriage(id),
  });
  if (triage?.sessionId) {
    return <Navigate to="/conversas/$id" params={{ id: triage.sessionId }} replace />;
  }
  return <Navigate to="/conversas" replace />;
}

export const Route = createFileRoute("/_app/triagens/$id")({
  component: TriageToConversation,
});