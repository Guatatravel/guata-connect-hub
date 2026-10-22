import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchMyOrganizations, setActiveOrganization } from "@/lib/organizations.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function OrgSwitcher() {
  const qc = useQueryClient();
  const load = useServerFn(fetchMyOrganizations);
  const switchOrg = useServerFn(setActiveOrganization);

  const { data, isLoading } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => load(),
  });

  const mut = useMutation({
    mutationFn: (organizationId: string) => switchOrg({ data: { organizationId } }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Organização alterada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data || data.organizations.length <= 1) return null;

  return (
    <Select
      value={data.activeOrganizationId}
      onValueChange={(v) => mut.mutate(v)}
      disabled={mut.isPending}
    >
      <SelectTrigger className="h-9 w-[200px] text-xs">
        <SelectValue placeholder="Organização" />
      </SelectTrigger>
      <SelectContent>
        {data.organizations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
