-- Function for vector similarity search
-- Used by SupabaseVectorStore for RAG retrieval

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding TEXT,
  match_threshold FLOAT DEFAULT 0.0,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  embedding TEXT,
  source_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.embedding,
    d.source_type,
    d.metadata,
    d.created_at,
    d.updated_at,
    -- Cosine similarity: 1 - (distance)
    -- pgvector's <=> operator returns cosine distance (0 = identical, 2 = opposite)
    1 - (d.embedding::vector <=> query_embedding::vector) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding::vector <=> query_embedding::vector) >= match_threshold
  ORDER BY d.embedding::vector <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION match_documents IS 'Vector similarity search using cosine distance. Returns documents ordered by similarity score (0-1, higher is better).';
