# Supabase Setup Guide - Knowledge Base (Tier 3)

This guide covers setting up Supabase with pgvector for the NexusAEC knowledge
base.

## Overview

Supabase provides:

- **PostgreSQL with pgvector** - Vector similarity search for RAG
- **Row Level Security (RLS)** - Fine-grained access control
- **Auto-generated APIs** - REST and GraphQL endpoints
- **Real-time subscriptions** - Live data updates
- **Storage** - File uploads for PDFs, CSVs

**Use Cases in NexusAEC:**

- Store asset knowledge embeddings (Tier 3 Knowledge Base)
- Vector similarity search for RAG retrieval
- Store user preferences, audit trail, draft references
- Manage asset data and safety manuals

---

## Local Development

### Option 1: Supabase CLI (Recommended)

The Supabase CLI provides a complete local development environment.

#### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux/WSL
curl -fsSL https://github.com/supabase/supabase/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/

# Windows
scoop install supabase
```

#### 2. Initialize Supabase in Project

```bash
cd /path/to/nexusAEC

# Initialize Supabase
supabase init

# This creates:
# - supabase/config.toml
# - supabase/seed.sql
```

#### 3. Start Supabase Local

```bash
supabase start

# Outputs:
# API URL: http://localhost:54321
# GraphQL URL: http://localhost:54321/graphql/v1
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL: http://localhost:54323
# Inbucket URL: http://localhost:54324
# anon key: eyJh...
# service_role key: eyJh...
```

#### 4. Apply Migrations

```bash
# Create migration from existing init-db.sql
supabase db diff -f init_schema

# Or manually copy
cp infra/init-db.sql supabase/migrations/20240101000000_init_schema.sql

# Apply migrations
supabase db reset

# View in Studio
open http://localhost:54323
```

#### 5. Update Environment Variables

```bash
# .env.local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

#### 6. Stop Supabase

```bash
supabase stop

# Or with volume cleanup
supabase stop --backup
```

### Option 2: Docker Compose (Lightweight)

If you don't need the full Supabase stack, use the existing Docker Compose setup
with pgvector.

```bash
# Already configured in infra/docker-compose.yml
pnpm infra:up

# Database runs on localhost:5432
# pgAdmin UI on localhost:5050 (with --profile tools)
```

**Limitations:**

- No Supabase Studio UI
- No auto-generated APIs
- No real-time subscriptions
- Manual connection string management

**When to use:** Simple vector store operations, development without
Supabase-specific features.

---

## Cloud Production

### 1. Create Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in:
   - **Name:** nexus-aec-prod
   - **Database Password:** (generate strong password, save to password manager)
   - **Region:** Choose closest to your users (e.g., us-west-1, eu-west-1)
   - **Plan:** Free tier for MVP, Pro for production

4. Wait 2-3 minutes for provisioning

### 2. Enable pgvector Extension

```sql
-- In Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Apply Schema

Option A: Copy-paste `init-db.sql` into SQL Editor and execute.

Option B: Use migrations:

```bash
# Link local project to Supabase cloud
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

### 4. Configure Connection

Get connection details from Supabase Dashboard > Settings > Database:

```bash
# .env.production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<from dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from dashboard - keep secret!>
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
```

### 5. Connection Pooling

Supabase provides connection pooling via Supavisor:

**Transaction Mode (default):**

```
postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres
```

**Session Mode (for migrations):**

```
postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Direct Connection (no pooling):**

```
postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres
```

**Recommendation:** Use transaction mode for application, session mode for
migrations.

### 6. Row Level Security (Optional)

Enable RLS for user_preferences and drafts tables:

```sql
-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own data
CREATE POLICY user_preferences_policy ON user_preferences
  FOR ALL
  USING (auth.uid()::text = user_id);

CREATE POLICY drafts_policy ON drafts
  FOR ALL
  USING (auth.uid()::text = user_id);

CREATE POLICY audit_policy ON audit_entries
  FOR ALL
  USING (auth.uid()::text = user_id);
```

**Note:** Documents and assets tables should remain open (no RLS) for RAG
retrieval.

---

## Schema Overview

### Documents Table (Vector Store)

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002/text-embedding-3-small
  source_type VARCHAR(50) CHECK (source_type IN ('ASSET', 'SAFETY_MANUAL', 'PROCEDURE')),
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Vector similarity index (IVFFlat)
CREATE INDEX documents_embedding_idx ON documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Usage:**

- Store asset descriptions, safety manual chunks, procedure steps
- Perform vector similarity search for RAG
- Filter by `source_type` for targeted retrieval

### Assets Table (Structured Data)

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY,
  asset_id VARCHAR(100) UNIQUE, -- e.g., "P-104"
  name VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  location VARCHAR(255),
  criticality VARCHAR(20),
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Usage:**

- Structured asset catalog
- Fast lookup by asset_id
- Metadata for filtering (category, location, criticality)

---

## Migration Workflow

### Creating Migrations

```bash
# Make changes in Supabase Studio or local DB

# Generate migration
supabase db diff -f add_new_feature

# Edit migration file
vim supabase/migrations/20240115_add_new_feature.sql

# Apply locally
supabase db reset

# Push to cloud
supabase db push
```

### Migration Best Practices

1. **Idempotent:** Use `IF NOT EXISTS`, `IF EXISTS`
2. **Reversible:** Consider rollback strategy
3. **Incremental:** Small, focused changes
4. **Tested:** Test locally before pushing to cloud

### Example Migration

```sql
-- supabase/migrations/20240115_add_embeddings_v3.sql

-- Update embedding dimension for text-embedding-3-small
ALTER TABLE documents
  ALTER COLUMN embedding TYPE vector(1536);

-- Recreate index with updated dimension
DROP INDEX IF EXISTS documents_embedding_idx;
CREATE INDEX documents_embedding_idx ON documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Embedding Configuration

### OpenAI Models

| Model                  | Dimension | Cost               | Use Case        |
| ---------------------- | --------- | ------------------ | --------------- |
| text-embedding-ada-002 | 1536      | $0.0001/1K tokens  | Legacy          |
| text-embedding-3-small | 1536      | $0.00002/1K tokens | **Recommended** |
| text-embedding-3-large | 3072      | $0.00013/1K tokens | High accuracy   |

**Default:** text-embedding-3-small (1536 dimensions)

**To change dimension:**

```sql
ALTER TABLE documents ALTER COLUMN embedding TYPE vector(3072);
```

### Vector Index Tuning

**IVFFlat Parameters:**

```sql
-- lists: Number of clusters (sqrt of total rows)
-- Good for 10K-1M rows
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- For 1M+ rows
WITH (lists = 1000);
```

**HNSW (Hierarchical Navigable Small World) - Better performance:**

```sql
-- Requires pgvector 0.5.0+
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

**Distance Functions:**

- `vector_cosine_ops` - Cosine similarity (recommended for normalized
  embeddings)
- `vector_l2_ops` - Euclidean distance
- `vector_ip_ops` - Inner product (dot product)

---

## Querying Vectors

### Similarity Search

```sql
-- Find similar documents (k-nearest neighbors)
SELECT
  id,
  content,
  source_type,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM documents
WHERE source_type = 'ASSET'
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

**Explanation:**

- `<=>` - Cosine distance operator
- `$1::vector` - Query embedding (1536-dimensional vector)
- `1 - distance` - Convert to similarity score (0-1)

### Filtered Search

```sql
-- Search within specific category
SELECT *
FROM documents
WHERE
  source_type = 'SAFETY_MANUAL'
  AND metadata->>'category' = 'Pumps'
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Hybrid Search (Full-text + Vector)

```sql
-- Add tsvector column
ALTER TABLE documents ADD COLUMN content_tsv tsvector;

-- Create index
CREATE INDEX documents_content_tsv_idx ON documents USING GIN(content_tsv);

-- Update trigger
CREATE TRIGGER documents_content_tsv_update
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION
tsvector_update_trigger(content_tsv, 'pg_catalog.english', content);

-- Query: Combine keyword + semantic
WITH keyword_results AS (
  SELECT id, ts_rank(content_tsv, query) AS rank
  FROM documents, plainto_tsquery('pump failure') query
  WHERE content_tsv @@ query
  ORDER BY rank DESC
  LIMIT 20
),
semantic_results AS (
  SELECT id, 1 - (embedding <=> $1::vector) AS similarity
  FROM documents
  ORDER BY embedding <=> $1::vector
  LIMIT 20
)
SELECT DISTINCT d.*,
  COALESCE(k.rank, 0) * 0.3 + COALESCE(s.similarity, 0) * 0.7 AS combined_score
FROM documents d
LEFT JOIN keyword_results k ON d.id = k.id
LEFT JOIN semantic_results s ON d.id = s.id
WHERE k.id IS NOT NULL OR s.id IS NOT NULL
ORDER BY combined_score DESC
LIMIT 10;
```

---

## Monitoring & Performance

### Key Metrics

```sql
-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index sizes
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Row counts
SELECT
  tablename,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public';

-- Vector index stats
SELECT * FROM pg_indexes WHERE indexname = 'documents_embedding_idx';
```

### Query Performance

```sql
-- Explain vector search
EXPLAIN ANALYZE
SELECT * FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Optimization Tips

1. **Vacuum regularly:** `VACUUM ANALYZE documents;`
2. **Rebuild indexes:** After bulk inserts
3. **Use connection pooling:** Supavisor (included in Supabase)
4. **Monitor slow queries:** Enable `pg_stat_statements`
5. **Set appropriate work_mem:** For large vector operations

---

## Backup & Recovery

### Supabase Cloud (Automatic)

- **Point-in-Time Recovery (PITR):** Pro plan and above
- **Daily Backups:** Free tier (7-day retention)
- **On-demand Backups:** Via dashboard

### Manual Backup

```bash
# Dump database
pg_dump "postgresql://postgres:<password>@<host>:5432/postgres" > backup.sql

# Dump only schema
pg_dump --schema-only ... > schema.sql

# Dump only vectors (large!)
pg_dump --table=documents ... > documents.sql

# Restore
psql "postgresql://..." < backup.sql
```

### Vector-specific Considerations

- **Embedding regeneration:** If embeddings are lost, can regenerate from source
  content
- **Index rebuilding:** Faster than re-embedding (if data exists)
- **Partial backups:** Export metadata separately from vectors

---

## Cost Optimization

### Supabase Pricing (as of 2024)

| Plan | Price   | Database | Storage | Bandwidth |
| ---- | ------- | -------- | ------- | --------- |
| Free | $0      | 500 MB   | 1 GB    | 5 GB      |
| Pro  | $25/mo  | 8 GB     | 100 GB  | 250 GB    |
| Team | $599/mo | Custom   | Custom  | Custom    |

### Vector Storage Costs

- **1536-dim vector:** ~6 KB per vector
- **100K vectors:** ~600 MB
- **1M vectors:** ~6 GB

**Recommendations:**

- **MVP (<50K assets):** Free tier or Pro
- **Production (100K-500K assets):** Pro plan
- **Enterprise (1M+ assets):** Team plan or self-hosted

### Optimization Strategies

1. **Chunk size:** Balance between granularity and storage (500-token chunks
   recommended)
2. **Metadata:** Store lightweight metadata in JSONB, not in content
3. **Archival:** Move old/unused documents to cheaper storage
4. **Compression:** PostgreSQL automatically compresses TOAST data

---

## Security Checklist

- [ ] Enable SSL/TLS for all connections
- [ ] Use connection pooling (Supavisor)
- [ ] Rotate database passwords regularly
- [ ] Implement Row Level Security (RLS) for user data
- [ ] Use service role key only in backend (never client-side)
- [ ] Enable audit logging (Supabase Pro)
- [ ] Set up database backups
- [ ] Monitor for unusual query patterns
- [ ] Limit anon key permissions (if using from client)
- [ ] Use environment variables for secrets

---

## Troubleshooting

### pgvector Extension Not Found

```sql
-- Check available extensions
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- Install (Supabase Cloud: auto-installed, just enable)
CREATE EXTENSION vector;
```

### Slow Vector Queries

```bash
# Check index exists
SELECT * FROM pg_indexes WHERE tablename = 'documents';

# Rebuild index
REINDEX INDEX documents_embedding_idx;

# Increase lists parameter
DROP INDEX documents_embedding_idx;
CREATE INDEX documents_embedding_idx ON documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 500);
```

### Connection Pooling Issues

```bash
# Use transaction mode for app
postgresql://postgres.<ref>:<pass>@<region>.pooler.supabase.com:5432/postgres

# Use session mode for migrations
postgresql://postgres.<ref>:<pass>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Out of Memory

```sql
-- Check memory settings
SHOW work_mem;
SHOW shared_buffers;

-- Increase for large vector operations (local only)
SET work_mem = '256MB';
```

---

## Next Steps

After Supabase is provisioned:

1. ✅ Task 3.12: Provision Supabase (this guide)
2. → Task 3.13: Design vector store schema (see `init-db.sql`)
3. → Task 3.14: Implement SupabaseVectorStore
4. → Task 3.15-3.24: Asset data sources and ingestion
5. → Task 3.25: RAG retrieval

---

## Resources

- **Supabase Docs:** https://supabase.com/docs
- **pgvector Guide:** https://github.com/pgvector/pgvector
- **Supabase CLI:** https://supabase.com/docs/guides/cli
- **Vector Search Tutorial:** https://supabase.com/docs/guides/ai/vector-columns
- **OpenAI Embeddings:** https://platform.openai.com/docs/guides/embeddings
