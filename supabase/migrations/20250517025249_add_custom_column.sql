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
