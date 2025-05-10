CREATE TABLE IF NOT EXISTS public.businesses (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.business_users (
  business_id BIGINT REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.projects (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  business_id BIGINT REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.estimate_items (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id BIGINT REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(10, 2),
  unit_type TEXT CHECK (unit_type IN ('unit', 'sq-ft', 'board-ft', 'hour', 'day', 'package', 'linear-ft')),
  amount NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  total_amount NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft',
  parent_item_id BIGINT REFERENCES public.estimate_items(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  is_sub_item BOOLEAN DEFAULT FALSE,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  business_id BIGINT REFERENCES public.businesses(id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  conversation_id BIGINT REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  related_estimate_item_id BIGINT REFERENCES public.estimate_items(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_business_id BIGINT;
BEGIN
  INSERT INTO public.businesses (name, created_at, updated_at)
  VALUES (
    'Business for ' || NEW.email,
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own businesses" ON public.businesses
  FOR SELECT
  USING (
    id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own businesses" ON public.businesses
  FOR UPDATE
  USING (
    id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view members of their businesses" ON public.business_users
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can manage business users" ON public.business_users
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view projects in their businesses" ON public.projects
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage projects in their businesses" ON public.projects
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view estimate items in their businesses" ON public.estimate_items
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE business_id IN (
        SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage estimate items in their businesses" ON public.estimate_items
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE business_id IN (
        SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can view conversations in their businesses" ON public.conversations
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage conversations in their businesses" ON public.conversations
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view messages in their businesses" ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE business_id IN (
        SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage messages in their businesses" ON public.messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE business_id IN (
        SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_users_user_id ON public.business_users(user_id);
CREATE INDEX IF NOT EXISTS idx_business_users_business_id ON public.business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_projects_business_id ON public.projects(business_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_project_id ON public.estimate_items(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON public.conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON public.conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);