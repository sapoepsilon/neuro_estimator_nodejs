-- Migration: Update get_project_estimate_items to support new flexible estimate_items structure
DROP FUNCTION IF EXISTS get_project_estimate_items(BIGINT);

CREATE OR REPLACE FUNCTION get_project_estimate_items(project_id_param BIGINT)
RETURNS SETOF jsonb AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'row_number', row_number,
    'item', jsonb_object_agg(ec.column_name, ei.value)
  )
  FROM estimate_items ei
  JOIN estimate_columns ec ON ei.column_id = ec.id
  WHERE ei.project_id = project_id_param
  GROUP BY row_number
  ORDER BY row_number;
END;
$$ LANGUAGE plpgsql STABLE;
