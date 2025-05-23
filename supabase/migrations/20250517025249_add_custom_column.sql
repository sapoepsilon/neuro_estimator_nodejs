-- Create a table to store custom column definitions per business
CREATE TABLE IF NOT EXISTS public.custom_columns (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  business_id BIGINT REFERENCES public.businesses(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  column_type TEXT NOT NULL CHECK (column_type IN ('text', 'number', 'boolean', 'date', 'select', 'multiselect')),
  is_required BOOLEAN DEFAULT FALSE,
  default_value JSONB,
  options JSONB, -- For select/multiselect types, stores available options
  ui_settings JSONB DEFAULT '{}'::jsonb, -- Stores UI configuration like width, visibility, order
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (business_id, column_key)
);

-- Add default columns for all businesses
INSERT INTO public.custom_columns 
  (business_id, column_key, display_name, column_type, is_required, ui_settings)
SELECT 
  id AS business_id,
  'title' AS column_key,
  'Title' AS display_name,
  'text' AS column_type,
  TRUE AS is_required,
  '{"order": 1, "width": 200, "visible": true}'::jsonb AS ui_settings
FROM public.businesses;

INSERT INTO public.custom_columns 
  (business_id, column_key, display_name, column_type, is_required, ui_settings)
SELECT 
  id AS business_id,
  'description' AS column_key,
  'Description' AS display_name,
  'text' AS column_type,
  FALSE AS is_required,
  '{"order": 2, "width": 300, "visible": true}'::jsonb AS ui_settings
FROM public.businesses;

INSERT INTO public.custom_columns 
  (business_id, column_key, display_name, column_type, is_required, ui_settings)
SELECT 
  id AS business_id,
  'quantity' AS column_key,
  'Quantity' AS display_name,
  'number' AS column_type,
  FALSE AS is_required,
  '{"order": 3, "width": 100, "visible": true}'::jsonb AS ui_settings
FROM public.businesses;

INSERT INTO public.custom_columns 
  (business_id, column_key, display_name, column_type, is_required, ui_settings)
SELECT 
  id AS business_id,
  'unit_price' AS column_key,
  'Unit Price' AS display_name,
  'number' AS column_type,
  FALSE AS is_required,
  '{"order": 4, "width": 120, "visible": true}'::jsonb AS ui_settings
FROM public.businesses;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_columns_business_id ON public.custom_columns(business_id);


-- Create a function to remove a specific key from the data JSONB column in estimate_items
CREATE OR REPLACE FUNCTION public.remove_column_from_data(column_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update all estimate_items that have the specified key in their data column
  WITH updated_items AS (
    UPDATE public.estimate_items
    SET data = data - column_key
    WHERE data ? column_key
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated_items;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.remove_column_from_data(TEXT) TO authenticated;