# Backup & Restore

Protect your Cinephage data with regular backups.

---

## What to Backup

| File/Directory               | Contents                                | Priority |
| ---------------------------- | --------------------------------------- | -------- |
| `data/cinephage.db`          | Database (all settings, library, queue) | Critical |
| `.env`                       | Environment configuration               | High     |
| `data/indexers/definitions/` | Custom indexer definitions              | Medium   |
| `logs/`                      | Application logs                        | Low      |

---

## Database Backup

The SQLite database contains all your data: library, settings, download history, and configuration.

### Manual Backup

```bash
# Simple copy (stop service first for safety)
sudo systemctl stop cinephage
cp /opt/cinephage/data/cinephage.db /backup/cinephage-$(date +%Y%m%d).db
sudo systemctl start cinephage
```

### While Running

SQLite supports copying while running, but stopping ensures consistency:

```bash
# Quick backup (may have uncommitted transactions)
cp /opt/cinephage/data/cinephage.db /backup/cinephage-$(date +%Y%m%d).db

# Safer: use SQLite backup command
sqlite3 /opt/cinephage/data/cinephage.db ".backup /backup/cinephage-$(date +%Y%m%d).db"
```

### Automated Backup Script

Create `/opt/cinephage/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backup/cinephage"
DATA_DIR="/opt/cinephage/data"
DATE=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database using SQLite backup command
sqlite3 $DATA_DIR/cinephage.db ".backup $BACKUP_DIR/cinephage-$DATE.db"

# Backup .env
cp /opt/cinephage/.env $BACKUP_DIR/env-$DATE

# Backup custom indexer definitions
if [ -d "$DATA_DIR/indexers/definitions" ]; then
    tar -czf $BACKUP_DIR/indexers-$DATE.tar.gz -C $DATA_DIR/indexers definitions
fi

# Keep only last 7 days of backups
find $BACKUP_DIR -name "cinephage-*.db" -mtime +7 -delete
find $BACKUP_DIR -name "env-*" -mtime +7 -delete
find $BACKUP_DIR -name "indexers-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

Make executable and schedule:

```bash
chmod +x /opt/cinephage/backup.sh

# Add to crontab (daily at 3 AM)
crontab -e
# Add: 0 3 * * * /opt/cinephage/backup.sh
```

---

## Docker Backup

For Docker installations:

```bash
# Backup data directory
docker exec cinephage sqlite3 /config/data/cinephage.db ".backup /config/data/backup.db"
cp ./config/data/backup.db /backup/cinephage-$(date +%Y%m%d).db
rm ./config/data/backup.db

# Or copy directly
cp ./config/data/cinephage.db /backup/cinephage-$(date +%Y%m%d).db
```

---

## Restore

### Stop the Service

```bash
# Docker
docker compose down

# Manual
sudo systemctl stop cinephage
```

### Restore Database

```bash
# Backup current database (just in case)
cp /opt/cinephage/data/cinephage.db /opt/cinephage/data/cinephage.db.old

# Restore from backup
cp /backup/cinephage-20250101.db /opt/cinephage/data/cinephage.db

# Fix ownership (manual installation)
sudo chown cinephage:cinephage /opt/cinephage/data/cinephage.db
```

### Restore Configuration

```bash
# Restore .env if needed
cp /backup/env-20250101 /opt/cinephage/.env
sudo chmod 600 /opt/cinephage/.env
```

### Restore Indexer Definitions

```bash
# If you backed up custom indexers
tar -xzf /backup/indexers-20250101.tar.gz -C /opt/cinephage/data/indexers
```

### Start the Service

```bash
# Docker
docker compose up -d

# Manual
sudo systemctl start cinephage
```

### Verify

1. Access Cinephage in browser
2. Check that library is intact
3. Verify settings are correct
4. Test a search to confirm indexers work

---

## Database Optimization

Periodically optimize the database:

```bash
# Stop service for safest optimization
sudo systemctl stop cinephage

# Vacuum to reclaim space and optimize
sqlite3 /opt/cinephage/data/cinephage.db "VACUUM;"

# Restart
sudo systemctl start cinephage
```

---

## Disaster Recovery

### Complete System Failure

1. Install fresh Cinephage instance
2. Restore database from backup
3. Restore .env configuration
4. Restore custom indexer definitions
5. Start service and verify

### Corrupted Database

If database is corrupted and you have no backup:

1. Stop Cinephage
2. Delete the database: `rm data/cinephage.db`
3. Start Cinephage (creates fresh database)
4. Reconfigure settings manually
5. Re-add media to library (metadata refetches from TMDB)

---

## Backup Best Practices

1. **Automate backups** - Don't rely on manual backups
2. **Test restores** - Periodically verify backups work
3. **Keep multiple copies** - At least 7 days of backups
4. **Off-site backup** - Copy backups to another location
5. **Backup before updates** - Always backup before upgrading

---

**See also:** [Deployment](deployment.md) | [Updating](updating.md) | [Settings Reference](../configuration/settings-reference.md)
