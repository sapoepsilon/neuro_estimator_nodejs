CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_business_id BIGINT;
BEGIN
  INSERT INTO public.businesses (name, created_at, updated_at)
  VALUES (
    '',
    NOW(),
    NOW()
  )
  RETURNING id INTO new_business_id;
  
  INSERT INTO public.business_users (business_id, user_id, role, created_at, updated_at)
  VALUES (
    new_business_id,
    NEW.id,
    'owner',
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
