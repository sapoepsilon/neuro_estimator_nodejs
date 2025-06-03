-- ========================================
-- CHA-60: Create get_project_items_by_row_numbers Function
-- ========================================
-- This function allows fetching estimate items by specific row numbers
-- instead of using OFFSET/LIMIT, which handles non-sequential row numbers
-- and gaps properly for range operations in the UI.

CREATE OR REPLACE FUNCTION get_project_items_by_row_numbers(
  project_id_param bigint,
  row_numbers integer[]
) 
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Input validation
  IF project_id_param IS NULL THEN
    RAISE EXCEPTION 'project_id_param cannot be null';
  END IF;
  
  IF row_numbers IS NULL THEN
    RAISE EXCEPTION 'row_numbers cannot be null';
  END IF;
  
  -- Return empty result for empty array (not an error)
  IF array_length(row_numbers, 1) IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT jsonb_build_object(
    'row_number', ei.row_number,
    'item', jsonb_object_agg(ec.column_name, ei.value ORDER BY ec.position)
  )
  FROM estimate_items ei
  JOIN estimate_columns ec ON ei.column_id = ec.id
  WHERE ei.project_id = project_id_param
    AND ei.row_number = ANY(row_numbers)
  GROUP BY ei.row_number
  ORDER BY ei.row_number;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_project_items_by_row_numbers(bigint, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_items_by_row_numbers(bigint, integer[]) TO service_role;

-- Add function comment for documentation
COMMENT ON FUNCTION get_project_items_by_row_numbers(bigint, integer[]) IS 
'Fetches estimate items by specific row numbers instead of using OFFSET/LIMIT. 
Handles non-sequential row numbers and gaps. Used for range operations in the UI.
Created for CHA-60: Database: Create get_project_items_by_row_numbers RPC function';