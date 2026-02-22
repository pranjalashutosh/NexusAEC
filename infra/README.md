# Infrastructure - Local Development

This directory contains Docker Compose configuration for local development.

## Services

| Service               | Port | Description                            |
| --------------------- | ---- | -------------------------------------- |
| Redis                 | 6379 | Session state storage (Tier 2)         |
| PostgreSQL + pgvector | 5432 | Knowledge base / Vector store (Tier 3) |
| Redis Commander       | 8081 | Redis management UI (optional)         |
| pgAdmin               | 5050 | PostgreSQL management UI (optional)    |

## Quick Start

```bash
# Start core services (Redis + PostgreSQL)
pnpm infra:up

# Start with management UIs
pnpm infra:up:tools

# View logs
pnpm infra:logs

# Stop services
pnpm infra:down

# Reset all data (WARNING: deletes volumes)
pnpm infra:reset
```

## Connection Details

### Redis

- **Host:** localhost
- **Port:** 6379
- **URL:** `redis://localhost:6379`

### PostgreSQL

- **Host:** localhost
- **Port:** 5432
- **Database:** nexus_aec
- **User:** postgres
- **Password:** postgres
- **URL:** `postgresql://postgres:postgres@localhost:5432/nexus_aec`

### Redis Commander (when using tools profile)

- **URL:** http://localhost:8081

### pgAdmin (when using tools profile)

- **URL:** http://localhost:5050
- **Email:** admin@nexus.local
- **Password:** admin

## Database Schema

The PostgreSQL database is initialized with:

- **documents** - Vector store for RAG (pgvector embeddings)
- **assets** - Structured asset data (NCE Asset IDs)
- **user_preferences** - User settings (VIPs, keywords, etc.)
- **audit_entries** - Action audit trail
- **drafts** - Draft email references

See `init-db.sql` for full schema.

## Seed Data

10 sample assets are automatically inserted:

- P-104, P-105 (Pumps at Riverside Bridge)
- V-201, V-202 (Valves at North Plant)
- G-301 (Generator at Main Facility)
- T-401, T-402 (Tanks at East Reservoir)
- M-501 (Motor at Processing Plant)
- S-601 (Sensors at Treatment Facility)
- C-701 (Control Panel at Control Room)

## Troubleshooting

### Port already in use

```bash
# Check what's using the port
lsof -i :5432
lsof -i :6379

# Kill the process or change ports in docker-compose.yml
```

### Reset database

```bash
# Remove volumes and restart
pnpm infra:reset
pnpm infra:up
```

### View PostgreSQL logs

```bash
docker logs nexus-postgres -f
```

### Connect to PostgreSQL CLI

```bash
docker exec -it nexus-postgres psql -U postgres -d nexus_aec
```

### Connect to Redis CLI

```bash
docker exec -it nexus-redis redis-cli
```

## Production Deployment

For production deployment instructions:

- **Redis (Session State):** See [PRODUCTION.md](./PRODUCTION.md)
- **Supabase (Knowledge Base):** See [SUPABASE.md](./SUPABASE.md)

## Supabase Setup

For the knowledge base (Tier 3), you can use either:

1. **Supabase CLI** (recommended for full features):

   ```bash
   supabase start
   ```

   See [SUPABASE.md](./SUPABASE.md) for complete setup guide.

2. **Docker Compose** (lightweight, vector store only):
   ```bash
   pnpm infra:up
   ```
   Uses existing PostgreSQL + pgvector setup.
