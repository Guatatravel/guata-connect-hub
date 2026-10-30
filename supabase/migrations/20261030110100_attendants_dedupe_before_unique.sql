-- Corrige falha 23505 ao criar attendants_org_line_unique (duplicatas mesmo created_at).
-- Seguro rodar mais de uma vez.

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

ALTER TABLE public.attendants
  ADD CONSTRAINT attendants_org_line_unique UNIQUE (organization_id, line);
