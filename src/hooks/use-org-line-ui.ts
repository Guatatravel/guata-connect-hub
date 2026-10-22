import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchOrganizationContext } from "@/lib/organizations.functions";
import type { OrgLineUi } from "@/lib/org-ui";

const defaultUi: OrgLineUi = {
  isGuataOrg: true,
  useDescubraKb: true,
  hasViagensChannel: false,
};

export function useOrgLineUi() {
  const fetchOrg = useServerFn(fetchOrganizationContext);
  const { data, isLoading } = useQuery({
    queryKey: ["org-context"],
    queryFn: () => fetchOrg(),
  });
  const ui: OrgLineUi = data
    ? {
        isGuataOrg: data.organization.isGuata,
        useDescubraKb: data.organization.useDescubraKb,
        hasViagensChannel: data.hasViagensChannel,
      }
    : defaultUi;
  return { ui, isLoading, organization: data?.organization };
}
