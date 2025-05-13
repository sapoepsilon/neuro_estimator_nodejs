-- Function to get conversations with messages for a project or user
CREATE OR REPLACE FUNCTION get_user_conversations(user_id_param UUID, project_id_param BIGINT DEFAULT NULL)
RETURNS SETOF jsonb AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jsonb_build_object(
      'id', c.id,
      'project_id', c.project_id,
      'business_id', c.business_id,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'created_by', c.created_by,
      'messages', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'content', m.content,
            'role', m.role,
            'created_at', m.created_at,
            'user_id', m.user_id,
            'related_estimate_item_id', m.related_estimate_item_id
          ) ORDER BY m.created_at ASC
        )
        FROM messages m
        WHERE m.conversation_id = c.id
      )
    )
  FROM 
    conversations c
    JOIN business_users bu ON c.business_id = bu.business_id
  WHERE 
    bu.user_id = user_id_param
    AND (project_id_param IS NULL OR c.project_id = project_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get a single conversation by ID with its messages
CREATE OR REPLACE FUNCTION get_conversation_by_id(conversation_id_param BIGINT, user_id_param UUID)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT 
    jsonb_build_object(
      'id', c.id,
      'project_id', c.project_id,
      'business_id', c.business_id,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'created_by', c.created_by,
      'messages', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'content', m.content,
            'role', m.role,
            'created_at', m.created_at,
            'user_id', m.user_id,
            'related_estimate_item_id', m.related_estimate_item_id
          ) ORDER BY m.created_at ASC
        )
        FROM messages m
        WHERE m.conversation_id = c.id
      )
    ) INTO result
  FROM 
    conversations c
    JOIN business_users bu ON c.business_id = bu.business_id
  WHERE 
    c.id = conversation_id_param
    AND bu.user_id = user_id_param;
    
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
