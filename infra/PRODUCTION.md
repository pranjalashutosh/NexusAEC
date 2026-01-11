# Production Deployment Guide

This guide covers deploying the NexusAEC infrastructure components to production environments.

## Redis - Session State (Tier 2)

Redis stores ephemeral session state (DriveState) for active briefing sessions. Sessions have a 24-hour TTL.

### Option 1: Managed Redis (Recommended)

#### AWS ElastiCache for Redis

```bash
# 1. Create Redis cluster via AWS Console or CLI
aws elasticache create-cache-cluster \
  --cache-cluster-id nexus-redis-prod \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --engine-version 7.0 \
  --port 6379

# 2. Configure security group
# Allow inbound TCP 6379 from your application security group

# 3. Get connection endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id nexus-redis-prod \
  --show-cache-node-info

# 4. Set environment variable
# REDIS_URL=redis://nexus-redis-prod.xxxxx.cache.amazonaws.com:6379
```

**Configuration:**
- **Instance Type:** `cache.t3.micro` (sufficient for MVP, ~500 active sessions)
- **Version:** Redis 7.0+
- **Replication:** Single node (session data is ephemeral, tolerate short outages)
- **Encryption:** Enable at-rest and in-transit encryption
- **Backup:** Not required (ephemeral data with 24h TTL)
- **Maintenance Window:** Off-peak hours

**Cost Estimate:** ~$15-20/month (us-east-1, t3.micro)

#### Upstash (Serverless Redis)

```bash
# 1. Create Redis database at https://console.upstash.com
# 2. Select region close to your users
# 3. Enable TLS
# 4. Copy connection URL

# Environment variable:
# REDIS_URL=rediss://default:xxxxx@us1-xxxxx.upstash.io:6379
```

**Configuration:**
- **Region:** Select closest to majority of users
- **Type:** Pay-as-you-go (suitable for MVP)
- **TLS:** Always enabled
- **Max Commands:** 10,000/day free tier, then pay-per-use

**Cost Estimate:** Free tier covers ~500-1000 sessions/day, then ~$0.20 per 10K commands

#### Redis Cloud

```bash
# 1. Create database at https://app.redislabs.com
# 2. Select cloud provider and region
# 3. Configure memory limit (256 MB sufficient for MVP)
# 4. Enable TLS
# 5. Copy connection URL

# Environment variable:
# REDIS_URL=rediss://default:password@redis-xxxxx.cloud.redislabs.com:6379
```

**Configuration:**
- **Memory:** 256 MB (handles ~2000+ active sessions)
- **Dataset Size:** 256 MB
- **Replication:** Not required (ephemeral data)
- **Eviction Policy:** `allkeys-lru` (automatically evict least recently used)
- **TLS:** Enabled

**Cost Estimate:** Free tier (30 MB), paid plans start at $5/month (500 MB)

### Option 2: Self-Hosted Redis

#### Docker Deployment (Single Server)

```yaml
# Production docker-compose.yml snippet
services:
  redis:
    image: redis:7-alpine
    container_name: nexus-redis-prod
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: >
      redis-server
      --appendonly yes
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --requirepass ${REDIS_PASSWORD}
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  redis-data:
    driver: local
```

**Environment:**
```bash
# .env.production
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379
REDIS_PASSWORD=generate-strong-password-here
```

#### Kubernetes Deployment

```yaml
# k8s/redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: nexus-aec
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        args:
        - redis-server
        - --appendonly yes
        - --maxmemory 512mb
        - --maxmemory-policy allkeys-lru
        - --requirepass $(REDIS_PASSWORD)
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
        volumeMounts:
        - name: redis-storage
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: redis-storage
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: nexus-aec
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: nexus-aec
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

**Create secret:**
```bash
kubectl create secret generic redis-secret \
  --from-literal=password=$(openssl rand -base64 32) \
  -n nexus-aec
```

**Environment variable:**
```bash
# For applications running in the same namespace
REDIS_URL=redis://:${REDIS_PASSWORD}@redis.nexus-aec.svc.cluster.local:6379
```

### Redis Configuration Best Practices

#### Memory Management

```bash
# Recommended settings for session state
maxmemory 512mb                    # Limit memory usage
maxmemory-policy allkeys-lru       # Evict least recently used keys when full
```

#### Persistence

```bash
# AOF (Append-Only File) for durability
appendonly yes                     # Enable AOF persistence
appendfsync everysec               # Fsync every second (good balance)
```

For purely ephemeral session state with TTLs, you can disable persistence:
```bash
appendonly no                      # No persistence needed
save ""                            # Disable RDB snapshots
```

#### Security

```bash
# Production security
requirepass strong-random-password  # Require password authentication
rename-command FLUSHDB ""          # Disable dangerous commands
rename-command FLUSHALL ""
rename-command CONFIG ""
```

#### Connection Limits

```bash
# Handle concurrent sessions
maxclients 10000                   # Maximum concurrent connections
timeout 300                        # Close idle connections after 5 minutes
```

### Monitoring

#### Health Checks

```bash
# Redis ping check
redis-cli -h <host> -p 6379 -a <password> PING
# Expected: PONG

# Memory usage
redis-cli -h <host> -p 6379 -a <password> INFO memory

# Connected clients
redis-cli -h <host> -p 6379 -a <password> CLIENT LIST
```

#### Key Metrics to Monitor

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Memory Usage | < 80% | Available memory utilization |
| Connected Clients | < 80% max | Number of concurrent connections |
| Evicted Keys | Low | Keys removed due to memory pressure |
| Keyspace Hits Ratio | > 90% | Cache hit rate (hits / (hits + misses)) |
| Network I/O | < 80% limit | Throughput in/out |

#### CloudWatch Alarms (AWS ElastiCache)

```bash
# CPU utilization
aws cloudwatch put-metric-alarm \
  --alarm-name nexus-redis-cpu-high \
  --metric-name CPUUtilization \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold

# Memory usage
aws cloudwatch put-metric-alarm \
  --alarm-name nexus-redis-memory-high \
  --metric-name DatabaseMemoryUsagePercentage \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

### Scaling Considerations

#### When to Scale Up

- **Memory Usage > 80%**: Upgrade instance type or increase memory limit
- **CPU Usage > 70%**: Upgrade to larger instance
- **Network Throughput Maxed**: Upgrade instance type
- **Eviction Rate High**: Add more memory

#### Vertical Scaling (AWS ElastiCache)

```bash
# Modify cache cluster
aws elasticache modify-cache-cluster \
  --cache-cluster-id nexus-redis-prod \
  --cache-node-type cache.t3.small \
  --apply-immediately
```

#### Horizontal Scaling (Redis Cluster)

For production at scale (1000+ concurrent users), consider Redis Cluster:

```bash
# Create Redis cluster (AWS)
aws elasticache create-replication-group \
  --replication-group-id nexus-redis-cluster \
  --replication-group-description "NexusAEC Session State Cluster" \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-node-groups 3 \
  --replicas-per-node-group 1
```

### Disaster Recovery

#### Backup Strategy

Since session data is ephemeral with 24h TTL:
- **Backups:** Not required (data regenerates from email sources)
- **RTO:** Immediate (sessions recreate on reconnect)
- **RPO:** Acceptable data loss = full cache (users restart briefing)

If you want to preserve session state:
```bash
# Enable automatic snapshots (AWS ElastiCache)
aws elasticache modify-cache-cluster \
  --cache-cluster-id nexus-redis-prod \
  --snapshot-retention-limit 1 \
  --snapshot-window "03:00-05:00"
```

### Security Checklist

- [ ] Enable TLS/SSL for connections in transit
- [ ] Set strong `requirepass` password
- [ ] Restrict network access via security groups/firewall
- [ ] Disable dangerous commands (`FLUSHDB`, `CONFIG`, etc.)
- [ ] Enable encryption at rest (managed services)
- [ ] Rotate passwords regularly
- [ ] Use IAM authentication where available (AWS)
- [ ] Monitor for unauthorized access attempts
- [ ] Enable audit logging

### Environment Variables

```bash
# Production .env
REDIS_URL=redis://:password@your-redis-host:6379

# With TLS (Upstash, Redis Cloud)
REDIS_URL=rediss://:password@your-redis-host:6379

# AWS ElastiCache (no password, use IAM or security groups)
REDIS_URL=redis://nexus-redis-prod.xxxxx.cache.amazonaws.com:6379
```

## PostgreSQL + pgvector - Knowledge Base (Tier 3)

See Supabase deployment documentation in task 3.12.

## Summary: Recommended Production Stack

### MVP/Startup (< 100 users)

| Component | Provider | Cost |
|-----------|----------|------|
| Redis | Upstash Free Tier or Redis Cloud Free | $0-5/month |
| PostgreSQL | Supabase Free Tier | $0/month |
| **Total** | | **$0-5/month** |

### Growth (100-1000 users)

| Component | Provider | Cost |
|-----------|----------|------|
| Redis | AWS ElastiCache t3.micro or Upstash Paid | $15-30/month |
| PostgreSQL | Supabase Pro | $25/month |
| **Total** | | **$40-55/month** |

### Scale (1000+ users)

| Component | Provider | Cost |
|-----------|----------|------|
| Redis | AWS ElastiCache t3.small cluster | $60-100/month |
| PostgreSQL | Supabase Team or Self-hosted RDS | $100-200/month |
| **Total** | | **$160-300/month** |

## Next Steps

1. Choose Redis provider based on budget and scale requirements
2. Provision Redis instance
3. Update `REDIS_URL` in production environment variables
4. Test connection from your application
5. Configure monitoring and alerts
6. Document runbook for operations team
