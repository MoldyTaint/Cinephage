# Performance Tuning

Optimize Cinephage for your hardware and usage patterns.

---

## Worker Tuning

Workers handle all background tasks. Adjust based on your system:

### Low-Memory Systems (2-4GB RAM)

```bash
WORKER_MAX_STREAMS=5
WORKER_MAX_IMPORTS=3
WORKER_MAX_SCANS=1
WORKER_MAX_MONITORING=3
WORKER_MAX_SEARCH=2
WORKER_MAX_LOGS=500
```

### Standard Systems (4-8GB RAM)

Use defaults:

```bash
WORKER_MAX_STREAMS=10
WORKER_MAX_IMPORTS=5
WORKER_MAX_SCANS=2
WORKER_MAX_MONITORING=5
WORKER_MAX_SEARCH=3
```

### High-Performance (16GB+ RAM)

```bash
WORKER_MAX_STREAMS=20
WORKER_MAX_IMPORTS=10
WORKER_MAX_SCANS=4
WORKER_MAX_MONITORING=10
WORKER_MAX_SEARCH=5
WORKER_MAX_SUBTITLE_SEARCH=5
```

---

## Database Optimization

### SQLite PRAGMAs

Cinephage uses these optimizations automatically:

- `PRAGMA journal_mode=WAL` - Write-ahead logging for better concurrency
- `PRAGMA synchronous=NORMAL` - Balance safety and speed
- `PRAGMA cache_size=-64000` - 64MB page cache

### Vacuum Schedule

Database grows over time. Vacuum monthly:

```bash
# Stop Cinephage first
sqlite3 data/cinephage.db "VACUUM;"
```

---

## Streaming Optimization

### Connection Tuning

```bash
# Increase for fast providers
PROXY_FETCH_TIMEOUT_MS=60000

# Decrease for slow connections
PROXY_SEGMENT_MAX_SIZE=26214400  # 25MB
```

### Circuit Breaker

If providers fail often:

```bash
# More tolerant
PROVIDER_MAX_FAILURES=5
PROVIDER_CIRCUIT_RESET_MS=120000
```

---

## Monitoring Intervals

Reduce frequency if system is slow:

```bash
# Less aggressive (hours)
interval_missing=24
interval_upgrade=168      # Weekly
interval_new_episode=6
```

---

## Log Management

### Reduce Logging

```bash
LOG_MAX_SIZE_MB=5
LOG_MAX_FILES=3
```

### Disable File Logging

```bash
LOG_TO_FILE=false
```

---

## System-Level Tuning

### Linux

Increase file watchers for large libraries:

```bash
# /etc/sysctl.conf
fs.inotify.max_user_watches=524288
```

### Docker

Set memory limits:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 512M
```

---

## Monitoring Performance

Check these metrics:

- **Worker queue depth** - Should be 0-5
- **Database size** - Vacuum when >500MB
- **Memory usage** - Adjust workers if >80%
- **Response times** - API calls should be <500ms

---

## See Also

- [Environment Variables](environment-variables.md) - All configuration options
- [Workers](../features/workers.md) - Background task system
