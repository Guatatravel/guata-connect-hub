-- Conta de parceiro de teste (não admin Guatá). Idempotente; só age se teste@gmail.com existir no Auth.
DO $$
DECLARE
  uid uuid;
  org_id uuid;
  guata_id uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower('teste@gmail.com') LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE 'provision_test_partner: teste@gmail.com ainda não cadastrado — nada a fazer.';
    RETURN;
  END IF;

  SELECT id INTO guata_id FROM public.organizations WHERE slug = 'guata' LIMIT 1;

  DELETE FROM public.user_roles WHERE user_id = uid AND role = 'admin';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'consultor')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT id INTO org_id FROM public.organizations WHERE slug = 'agencia-teste';
  IF org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, is_guata, use_descubra_kb, access_liberado)
    VALUES ('Agência Teste', 'agencia-teste', false, false, true)
    RETURNING id INTO org_id;
  ELSE
    UPDATE public.organizations SET access_liberado = true WHERE id = org_id;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org_id, uid, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET active_organization_id = org_id
  WHERE id = uid;

  IF guata_id IS NOT NULL THEN
    DELETE FROM public.organization_members
    WHERE organization_id = guata_id AND user_id = uid;
  END IF;

  INSERT INTO public.whatsapp_channels (organization_id, line, label)
  VALUES
    (org_id, 'descubra', 'Descubra MS'),
    (org_id, 'viagens', 'Guatá Viagens')
  ON CONFLICT (organization_id, line) DO NOTHING;

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
    org_id,
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
    COALESCE(
      (SELECT mensagem_fora_horario FROM public.channel_settings LIMIT 1),
      'Recebemos sua mensagem! Retornamos em horário comercial.'
    ),
    COALESCE(
      (SELECT mensagem_humano FROM public.channel_settings LIMIT 1),
      'Um consultor humano assumirá a conversa em instantes.'
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.channel_settings cs WHERE cs.organization_id = org_id
  );
END $$;
