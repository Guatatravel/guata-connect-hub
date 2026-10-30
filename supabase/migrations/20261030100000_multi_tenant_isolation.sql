-- Multi-tenant: dedupe atendentes, org em campanhas, índices e RLS por organização.

-- 1) Atendentes virtuais: um por linha por org
-- (pares com mesmo created_at não eram removidos pelo DELETE antigo a.created_at < b.created_at)
DELETE FROM public.attendants
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id, line
        ORDER BY
          (CASE WHEN ativo THEN 0 ELSE 1 END),
          updated_at DESC NULLS LAST,
          created_at DESC,
          id DESC
      ) AS rn
    FROM public.attendants
  ) ranked
  WHERE rn > 1
);

ALTER TABLE public.attendants
  DROP CONSTRAINT IF EXISTS attendants_org_line_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendants_org_line_unique'
      AND conrelid = 'public.attendants'::regclass
  ) THEN
    ALTER TABLE public.attendants
      ADD CONSTRAINT attendants_org_line_unique UNIQUE (organization_id, line);
  END IF;
END $$;

-- 2) Campanhas / disparos por organização
ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE;

UPDATE public.broadcast_campaigns
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'guata' LIMIT 1)
WHERE organization_id IS NULL;

ALTER TABLE public.broadcast_campaigns
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS broadcast_campaigns_org_idx
  ON public.broadcast_campaigns (organization_id, created_at DESC);

-- 3) Configurações por org (remove singleton único global)
CREATE UNIQUE INDEX IF NOT EXISTS channel_settings_organization_unique
  ON public.channel_settings (organization_id)
  WHERE organization_id IS NOT NULL;

INSERT INTO public.channel_settings (
  organization_id,
  singleton,
  persona_descubra,
  persona_viagens,
  horario_atendimento,
  mensagem_fora_horario,
  mensagem_humano
)
SELECT
  o.id,
  false,
  COALESCE(
    (SELECT persona_descubra FROM public.channel_settings WHERE organization_id IS NOT NULL LIMIT 1),
    (SELECT persona_descubra FROM public.channel_settings LIMIT 1),
    'Sou o Guatá, assistente turístico oficial de Mato Grosso do Sul.'
  ),
  COALESCE(
    (SELECT persona_viagens FROM public.channel_settings LIMIT 1),
    'Sou consultor da agência Viagens MS.'
  ),
  COALESCE((SELECT horario_atendimento FROM public.channel_settings LIMIT 1), 'Seg a Sex, 8h às 18h'),
  COALESCE((SELECT mensagem_fora_horario FROM public.channel_settings LIMIT 1), 'Recebemos sua mensagem! Retornamos em horário comercial.'),
  COALESCE((SELECT mensagem_humano FROM public.channel_settings LIMIT 1), 'Um consultor humano assumirá a conversa em instantes.')
FROM public.organizations o
WHERE o.is_guata = false
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_settings cs WHERE cs.organization_id = o.id
  );

-- 4) Helpers RLS
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE ur.user_id = _uid
      AND ur.role = 'admin'::app_role
      AND o.is_guata = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_organization(_uid uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_uid)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = _uid AND om.organization_id = _org_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.user_can_access_organization(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_organization(uuid, uuid) TO authenticated, service_role;

-- 5) Sessions / attendants / knowledge — escopo por org
DROP POLICY IF EXISTS "staff le channels" ON public.whatsapp_channels;
CREATE POLICY "member le channels" ON public.whatsapp_channels FOR SELECT TO authenticated
  USING (public.user_can_access_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admin gerencia channels" ON public.whatsapp_channels;
CREATE POLICY "member gerencia channels" ON public.whatsapp_channels FOR ALL TO authenticated
  USING (public.user_can_access_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_can_access_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "staff le members" ON public.organization_members;
CREATE POLICY "member le own memberships" ON public.organization_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "staff le organizations" ON public.organizations;
CREATE POLICY "member le organizations" ON public.organizations FOR SELECT TO authenticated
  USING (public.user_can_access_organization(auth.uid(), id));

DROP POLICY IF EXISTS "staff le atendentes" ON public.attendants;
CREATE POLICY "member le attendants" ON public.attendants FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff le documentos" ON public.knowledge_documents;
CREATE POLICY "member le knowledge" ON public.knowledge_documents FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff insere documentos" ON public.knowledge_documents;
CREATE POLICY "member insere knowledge" ON public.knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff atualiza documentos" ON public.knowledge_documents;
CREATE POLICY "member atualiza knowledge" ON public.knowledge_documents FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff lê sessions" ON public.sessions;
CREATE POLICY "member le sessions" ON public.sessions FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff atualiza sessions" ON public.sessions;
CREATE POLICY "member atualiza sessions" ON public.sessions FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff insere sessions" ON public.sessions;
CREATE POLICY "member insere sessions" ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff lê messages" ON public.messages;
CREATE POLICY "member le messages" ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = messages.session_id
        AND s.organization_id IS NOT NULL
        AND public.user_can_access_organization(auth.uid(), s.organization_id)
    )
  );

DROP POLICY IF EXISTS "staff read broadcast_campaigns" ON public.broadcast_campaigns;
DROP POLICY IF EXISTS "staff write broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "member read broadcast_campaigns" ON public.broadcast_campaigns FOR SELECT TO authenticated
  USING (public.user_can_access_organization(auth.uid(), organization_id));
CREATE POLICY "member write broadcast_campaigns" ON public.broadcast_campaigns FOR ALL TO authenticated
  USING (public.user_can_access_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_can_access_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "staff lê settings" ON public.channel_settings;
CREATE POLICY "member le settings" ON public.channel_settings FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.user_can_access_organization(auth.uid(), organization_id)
  );
