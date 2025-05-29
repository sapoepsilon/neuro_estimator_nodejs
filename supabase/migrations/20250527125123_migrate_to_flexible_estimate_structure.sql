CREATE TABLE IF NOT EXISTS public.estimate_columns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  column_name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text', 'numeric', 'boolean', 'date', 'jsonb')),
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, column_name)
);

-- Table to store the original estimate items data
CREATE TABLE IF NOT EXISTS public.estimate_items_backup (
  id bigint PRIMARY KEY,
  project_id bigint NOT NULL,
  title text,
  description text,
  quantity numeric,
  unit_price numeric,
  amount numeric,
  unit_type text,
  cost_type text,
  currency text,
  status text,
  parent_item_id bigint,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  original_data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.new_estimate_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  column_id bigint NOT NULL REFERENCES public.estimate_columns(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, row_number, column_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_items_project_id ON public.new_estimate_items(project_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_column_id ON public.new_estimate_items(column_id);

CREATE OR REPLACE FUNCTION migrate_estimate_data()
RETURNS void AS $$
DECLARE
  project_record RECORD;
  item_record RECORD;
  row_num integer := 1;
  prev_project_id bigint := NULL;
BEGIN
  -- Drop and recreate the estimate_columns table with updated constraint
  DROP TABLE IF EXISTS public.estimate_columns CASCADE;
  CREATE TABLE public.estimate_columns (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    column_name text NOT NULL,
    data_type text NOT NULL CHECK (data_type IN ('text', 'numeric', 'boolean', 'date', 'jsonb')),
    is_required boolean NOT NULL DEFAULT false,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, column_name)
  );

  -- Recreate the foreign key constraint that might have been dropped
  ALTER TABLE public.new_estimate_items 
  ADD CONSTRAINT estimate_items_column_id_fkey 
  FOREIGN KEY (column_id) REFERENCES public.estimate_columns(id) ON DELETE CASCADE;

  -- First, backup all existing estimate items with their full data
  INSERT INTO public.estimate_items_backup
  SELECT 
    id, project_id, title, description, quantity, unit_price, amount, 
    unit_type, cost_type, currency, status, parent_item_id, 
    COALESCE(data, '{}'::jsonb) as data, 
    created_at, updated_at,
    to_jsonb(ei.*) as original_data
  FROM public.estimate_items ei;

  FOR project_record IN SELECT id FROM public.projects LOOP
    INSERT INTO public.estimate_columns (project_id, column_name, data_type, is_required, position)
    VALUES 
      (project_record.id, 'title', 'text', true, 1),
      (project_record.id, 'description', 'text', false, 2),
      (project_record.id, 'quantity', 'numeric', false, 3),
      (project_record.id, 'unit_type', 'text', false, 4),
      (project_record.id, 'unit_price', 'numeric', false, 5),
      (project_record.id, 'amount', 'numeric', false, 6),
      (project_record.id, 'cost_type', 'text', false, 7),
      (project_record.id, 'status', 'text', false, 8),
      (project_record.id, 'currency', 'text', false, 9),
      (project_record.id, 'parent_item_id', 'numeric', false, 10),
      (project_record.id, 'data', 'jsonb', false, 11);
  END LOOP;

  -- Migrate existing estimate items to the new structure
  FOR project_record IN SELECT id FROM public.projects LOOP
    -- Reset row counter for each new project
    IF prev_project_id IS DISTINCT FROM project_record.id THEN
      row_num := 1;
      prev_project_id := project_record.id;
    END IF;

    -- For each estimate item in the old structure
    FOR item_record IN 
      SELECT * FROM public.estimate_items 
      WHERE project_id = project_record.id
      ORDER BY id
    LOOP
      -- Insert values into the new structure, mapping all columns
      INSERT INTO public.new_estimate_items (project_id, row_number, column_id, value, created_at, updated_at)
      SELECT 
        item_record.project_id, 
        row_num,
        ec.id,
        CASE 
          WHEN ec.column_name = 'title' THEN item_record.title
          WHEN ec.column_name = 'description' THEN item_record.description
          WHEN ec.column_name = 'quantity' THEN item_record.quantity::text
          WHEN ec.column_name = 'unit_type' THEN item_record.unit_type
          WHEN ec.column_name = 'unit_price' THEN item_record.unit_price::text
          WHEN ec.column_name = 'amount' THEN item_record.amount::text
          WHEN ec.column_name = 'cost_type' THEN item_record.cost_type
          WHEN ec.column_name = 'status' THEN item_record.status
          WHEN ec.column_name = 'currency' THEN item_record.currency
          WHEN ec.column_name = 'parent_item_id' THEN item_record.parent_item_id::text
          WHEN ec.column_name = 'data' THEN item_record.data::text
          ELSE NULL
        END,
        item_record.created_at,
        item_record.updated_at
      FROM public.estimate_columns ec
      WHERE ec.project_id = project_record.id
      AND ec.column_name IN (
        'title', 'description', 'quantity', 'unit_type', 'unit_price', 
        'amount', 'cost_type', 'status', 'currency', 'parent_item_id', 'data'
      )
      AND (ec.column_name != 'data' OR item_record.data IS NOT NULL);

      row_num := row_num + 1;
    END LOOP;
  END LOOP;

  -- After migration is complete, drop the old table and rename the new one
  -- First drop any dependent objects
  DROP TRIGGER IF EXISTS update_estimate_items_updated_at ON public.estimate_items;
  DROP FUNCTION IF EXISTS update_updated_at_column();
  
  -- Now drop the table with CASCADE to handle any remaining dependencies
  DROP TABLE IF EXISTS public.estimate_items CASCADE;
  
  -- Rename the new table
  ALTER TABLE public.new_estimate_items RENAME TO estimate_items;
  
  -- Recreate indexes with the correct table name
  DROP INDEX IF EXISTS public.idx_estimate_items_project_id;
  DROP INDEX IF EXISTS public.idx_estimate_items_column_id;
  CREATE INDEX idx_estimate_items_project_id ON public.estimate_items(project_id);
  CREATE INDEX idx_estimate_items_column_id ON public.estimate_items(column_id);
  
  ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;
  
  DROP FUNCTION IF EXISTS migrate_estimate_data();
END;
$$ LANGUAGE plpgsql;

SELECT migrate_estimate_data();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_estimate_items_updated_at
BEFORE UPDATE ON public.estimate_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();