-- Function to get estimate items for a given project_id without triggering RLS recursion
CREATE OR REPLACE FUNCTION get_project_estimate_items(project_id_param BIGINT)
RETURNS SETOF jsonb AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jsonb_build_object(
      'id', ei.id,
      'title', ei.title,
      'description', ei.description,
      'quantity', ei.quantity,
      'unit_price', ei.unit_price,
      'unit_type', ei.unit_type,
      'amount', ei.amount,
      'currency', ei.currency,
      'total_amount', ei.total_amount,
      'created_at', ei.created_at,
      'updated_at', ei.updated_at,
      'status', ei.status,
      'parent_item_id', ei.parent_item_id,
      'created_by', ei.created_by,
      'is_sub_item', ei.is_sub_item,
      'data', ei.data
    )
  FROM 
    estimate_items ei
  WHERE 
    ei.project_id = project_id_param
  ORDER BY
    ei.is_sub_item ASC, 
    ei.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
