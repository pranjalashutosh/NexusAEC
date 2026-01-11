# Intelligence CLI Tools

Command-line tools for managing the NexusAEC knowledge base (Tier 3).

## Prerequisites

### Environment Variables

Create a `.env` file in the `packages/intelligence` directory:

```bash
# OpenAI API Key (for generating embeddings)
OPENAI_API_KEY=sk-...

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Database Setup

Ensure you have run the Supabase migrations:

```bash
cd supabase
supabase db push
```

This creates the `documents` table and `match_documents` function required for vector search.

## Available Commands

### ingest-manuals

Ingest safety manuals from JSON or PDF files into the vector store.

**Basic Usage:**

```bash
# Ingest from JSON file
npx tsx cli/ingest-manuals.ts json --file ./data/seed-safety-manuals.json

# Or simply (assumes JSON):
npx tsx cli/ingest-manuals.ts --file ./data/seed-safety-manuals.json

# Ingest from PDF file
npx tsx cli/ingest-manuals.ts pdf \
  --file ./manuals/loto-procedure.pdf \
  --id PROC-001 \
  --title "Lockout/Tagout Procedure" \
  --type PROCEDURE
```

**JSON Mode Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <path>` | Path to JSON file (required) | - |
| `-c, --clear` | Clear existing safety manuals before ingestion | `false` |
| `-b, --batch-size <number>` | Batch size for processing | `10` |
| `--skip-validation` | Skip document validation | `false` |
| `--max-concurrency <number>` | Max concurrent embedding requests | `5` |
| `--embedding-model <model>` | OpenAI embedding model | `text-embedding-3-small` |
| `--no-progress` | Disable progress reporting | `false` |

**PDF Mode Options:**

| Option | Description | Required |
|--------|-------------|----------|
| `-f, --file <path>` | Path to PDF file | Yes |
| `-i, --id <id>` | Document ID (e.g., PROC-001) | Yes |
| `-t, --title <title>` | Document title | Yes |
| `--type <type>` | Document type | Yes |
| `-a, --assets <assets>` | Comma-separated related asset IDs | No |
| `-m, --metadata <json>` | Additional metadata as JSON string | No |
| `--max-concurrency <number>` | Max concurrent embedding requests | `5` |
| `--embedding-model <model>` | OpenAI embedding model | `text-embedding-3-small` |
| `--no-progress` | Disable progress reporting | `false` |

**Document Types:**
- `SAFETY_MANUAL` - Safety manuals and handbooks
- `PROCEDURE` - Operating procedures and work instructions
- `POLICY` - Safety policies and guidelines
- `GUIDELINE` - Best practices and recommendations

**Examples:**

```bash
# Ingest seed safety manuals
npx tsx cli/ingest-manuals.ts --file ./data/seed-safety-manuals.json

# Clear existing and ingest fresh data
npx tsx cli/ingest-manuals.ts json --file ./data/manuals.json --clear

# Ingest PDF with related assets
npx tsx cli/ingest-manuals.ts pdf \
  --file ./manuals/pump-safety.pdf \
  --id SM-001 \
  --title "Pump Station Safety Manual" \
  --type SAFETY_MANUAL \
  --assets "P-104,P-105,P-201"

# Ingest PDF with metadata
npx tsx cli/ingest-manuals.ts pdf \
  --file ./procedures/confined-space.pdf \
  --id PROC-002 \
  --title "Confined Space Entry Procedure" \
  --type PROCEDURE \
  --metadata '{"version":"2.0","effectiveDate":"2024-01-01","oshaReference":"29 CFR 1910.146"}'
```

**JSON Format:**

```json
[
  {
    "id": "PROC-001",
    "title": "Lockout/Tagout Procedure",
    "content": "LOCKOUT/TAGOUT (LOTO) PROCEDURE...",
    "type": "PROCEDURE",
    "relatedAssets": ["P-104", "P-105", "M-501"],
    "metadata": {
      "version": "5.0",
      "effectiveDate": "2024-03-01",
      "oshaReference": "29 CFR 1910.147"
    }
  }
]
```

See `data/seed-safety-manuals.json` for a complete example.

### list-assets

List and search assets and safety manuals in the vector store.

**Basic Usage:**

```bash
# List all items (default limit 20)
npx tsx cli/list-assets.ts

# List only assets
npx tsx cli/list-assets.ts --type asset

# List only safety manuals
npx tsx cli/list-assets.ts --type manual

# Get counts only
npx tsx cli/list-assets.ts --count

# Semantic search
npx tsx cli/list-assets.ts --search "pump station maintenance"
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Filter by type: asset, manual, or all | `all` |
| `-l, --limit <number>` | Maximum number of items to display | `20` |
| `-o, --offset <number>` | Number of items to skip (pagination) | `0` |
| `-s, --search <query>` | Semantic search query | - |
| `-c, --count` | Only display counts, not items | `false` |
| `--similarity <threshold>` | Minimum similarity threshold for search (0-1) | `0.7` |
| `--no-color` | Disable colored output | `false` |

**Examples:**

```bash
# List first 10 assets
npx tsx cli/list-assets.ts --type asset --limit 10

# List next 10 assets (pagination)
npx tsx cli/list-assets.ts --type asset --limit 10 --offset 10

# Search for pump-related safety documents
npx tsx cli/list-assets.ts --type manual --search "pump safety procedures"

# Search with lower similarity threshold (more results)
npx tsx cli/list-assets.ts --search "emergency shutdown" --similarity 0.5

# Get total counts
npx tsx cli/list-assets.ts --count

# List safety manuals with limit
npx tsx cli/list-assets.ts --type manual --limit 5
```

**Output Format:**

```
📊 NexusAEC Knowledge Base
──────────────────────────────────────────────────
Type: all
Limit: 20
Offset: 0
──────────────────────────────────────────────────

🔧 ASSETS
──────────────────────────────────────────────────

1. Pump Station 104 [P-104]
   Category: PUMP
   Location: Riverside Bridge Station
   Criticality: CRITICAL
   Status: OPERATIONAL
   Description: Main water distribution pump for Riverside district. Primary pump delivering 5000 GPM...

📚 SAFETY MANUALS
──────────────────────────────────────────────────

1. Lockout/Tagout Procedure [PROC-001]
   Type: PROCEDURE
   Related Assets: P-104, P-105, M-501, E-301, G-301
   Content: LOCKOUT/TAGOUT (LOTO) PROCEDURE PURPOSE This procedure establishes requirements for...

──────────────────────────────────────────────────
SUMMARY
──────────────────────────────────────────────────
Total Assets: 39
Total Safety Manuals: 7
Total Documents: 46

Displayed Assets: 10 of 39
Displayed Manuals: 5 of 7
```

**Semantic Search:**

The `--search` option performs semantic search using OpenAI embeddings. This finds documents based on meaning, not just keyword matching:

```bash
# Find documents about electrical safety
npx tsx cli/list-assets.ts --search "electrical hazards and arc flash protection"

# Find pump-related assets
npx tsx cli/list-assets.ts --type asset --search "water distribution pumps"

# Search with specific similarity threshold
npx tsx cli/list-assets.ts --search "confined space entry" --similarity 0.8
```

The similarity threshold (0-1) controls how closely results must match:
- `0.9-1.0` - Very similar (strict matching)
- `0.7-0.8` - Moderately similar (default, balanced)
- `0.5-0.6` - Loosely similar (broad matching)

### ingest-assets

Ingest assets from CSV or JSON files into the vector store.

**Basic Usage:**

```bash
# Ingest from CSV file
npx tsx cli/ingest-assets.ts --file ./data/assets.csv

# Ingest from JSON file
npx tsx cli/ingest-assets.ts --file ./data/seed-assets.json
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <path>` | Path to CSV or JSON file (required) | - |
| `-c, --clear` | Clear existing assets before ingestion | `false` |
| `-b, --batch-size <number>` | Batch size for processing | `10` |
| `--skip-validation` | Skip asset validation | `false` |
| `--max-concurrency <number>` | Max concurrent embedding requests | `5` |
| `--embedding-model <model>` | OpenAI embedding model | `text-embedding-3-small` |
| `--no-progress` | Disable progress reporting | `false` |

**Examples:**

```bash
# Ingest seed data with progress reporting
npx tsx cli/ingest-assets.ts --file ./data/seed-assets.json

# Clear existing and ingest from CSV
npx tsx cli/ingest-assets.ts --file ./data/assets.csv --clear

# Use larger batch size for better performance
npx tsx cli/ingest-assets.ts --file ./data/assets.csv --batch-size 20

# Skip validation for faster ingestion
npx tsx cli/ingest-assets.ts --file ./data/assets.csv --skip-validation

# Use different embedding model
npx tsx cli/ingest-assets.ts --file ./data/assets.csv --embedding-model text-embedding-3-large
```

**CSV Format:**

The CSV file should have the following required columns:
- `AssetID` (or `assetId`, `asset_id`, `id`, etc.)
- `Name` (or `name`, `asset name`, etc.)
- `Description`
- `Category` (or `type`, `asset type`, etc.)
- `Location` (or `site`, `facility`, etc.)

Optional columns:
- `Criticality` - CRITICAL, HIGH, MEDIUM, LOW
- `Status` - OPERATIONAL, MAINTENANCE, OFFLINE, DECOMMISSIONED
- Any additional columns are stored as metadata

See `data/assets-template.csv` for a complete example.

**JSON Format:**

```json
[
  {
    "assetId": "P-104",
    "name": "Pump Station 104",
    "description": "Main water distribution pump for Riverside district",
    "category": "PUMP",
    "location": "Riverside Bridge Station",
    "criticality": "CRITICAL",
    "status": "OPERATIONAL",
    "metadata": {
      "manufacturer": "FlowTech Industries",
      "model": "FT-5000",
      "serialNumber": "FT5K-2018-0104"
    }
  }
]
```

See `data/seed-assets.json` for a complete example.

## Exit Codes

- `0` - Success (all assets ingested successfully)
- `1` - Partial failure (some assets failed) or fatal error

## Progress Reporting

The CLI provides real-time progress updates:

```
📦 NexusAEC Asset Ingestion
──────────────────────────────────────────────────
File: /path/to/assets.csv
Format: CSV
Batch size: 10
Max concurrency: 5
Embedding model: text-embedding-3-small
Clear existing: No
Skip validation: No
──────────────────────────────────────────────────

LOADING [████████████████████████████████████████] 100% - Loaded 39 assets
EMBEDDING [████████████████████████████████████████] 100% - Generating embeddings for batch 1
STORING [████████████████████████████████████████] 100% - Processed 39 of 39 assets
COMPLETE [████████████████████████████████████████] 100% - Ingestion complete: 39 succeeded, 0 failed

✅ Ingestion Complete
──────────────────────────────────────────────────
Total assets: 39
✓ Succeeded: 39
✗ Failed: 0
Duration: 12.34s
```

## Error Handling

The CLI reports errors encountered during ingestion:

```
⚠️  Errors (2):
  - Missing required field: name [P-BAD-001] (row 5)
  - Failed to generate embedding: API error [P-BAD-002] (row 8)
```

By default, the CLI continues processing when errors occur. To stop on the first error, the code would need to be modified to pass `continueOnError: false` to the AssetIngestion constructor.

## Performance Tips

1. **Batch Size**: Increase `--batch-size` for large datasets (e.g., `--batch-size 50`)
2. **Concurrency**: Adjust `--max-concurrency` based on your OpenAI rate limits
3. **Skip Validation**: Use `--skip-validation` if you've already validated your data
4. **Embedding Model**: Use `text-embedding-3-small` for cost-effective embeddings (1536 dimensions)

## Troubleshooting

### "OPENAI_API_KEY environment variable is required"

Make sure you have a `.env` file in `packages/intelligence/` with your OpenAI API key:

```bash
OPENAI_API_KEY=sk-...
```

### "SUPABASE_URL environment variable is required"

Add your Supabase project credentials to `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### "Missing required columns"

Ensure your CSV has all required columns. The CLI supports various column name formats (case-insensitive):
- Asset ID: `AssetID`, `assetId`, `asset_id`, `id`, etc.
- Name: `Name`, `name`, `Asset Name`, etc.
- Description: `Description`, `desc`, `details`, etc.
- Category: `Category`, `type`, `Asset Type`, etc.
- Location: `Location`, `site`, `facility`, etc.

### "OpenAI embedding error: Rate limit exceeded"

Reduce `--max-concurrency` to avoid rate limits:

```bash
npx tsx cli/ingest-assets.ts --file ./data/assets.csv --max-concurrency 2
```

### "Failed to connect to Supabase"

Verify your Supabase credentials and ensure your database is running:

```bash
supabase status
```

## Next Steps

After ingesting assets:

1. Verify ingestion with `list-assets` CLI (Task 3.23)
2. Test semantic search queries
3. Use in RAG retrieval for voice assistant (Task 3.25+)

## Support

For issues or questions:
- Review the main README at `packages/intelligence/README.md`
- Check the data format documentation at `packages/intelligence/data/README.md`
- See type definitions in `src/knowledge/asset-types.ts`
