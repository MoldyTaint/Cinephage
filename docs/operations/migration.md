[< Back to Index](../INDEX.md) | [Installation](../getting-started/installation.md) | [Troubleshooting](../support/troubleshooting.md)

# Migration Guide

This guide covers upgrading from older Cinephage versions with breaking changes.

---

## Volume Mount Migration (/app/data → /config)

**Applies to:** Users upgrading from versions before January 2026 that used `/app/data` and `/app/logs` mounts.

### Why This Change?

The `/config` consolidation:

- Prevents accidentally overwriting application code by mounting `/app`
- Simplifies volume management (one mount instead of two)
- Aligns with Docker best practices
- Reduces risk of permission issues

### Migration Path

#### Option 1: Automatic Migration (Recommended)

The container entrypoint automatically detects and migrates your data.

**Step 1:** Update `docker-compose.yaml`

Add the `/config` mount **while keeping** the old mounts temporarily:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config # NEW: Add this line
      - ./data:/app/data # KEEP temporarily for migration
      - ./logs:/app/logs # KEEP temporarily for migration
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

**Step 2:** Start the container

```bash
docker compose up -d
```

The entrypoint will detect both old and new mounts and automatically copy your data:

```
Migrating data from /app/data to /config/data...
Migrating logs from /app/logs to /config/logs...
```

**Step 3:** Verify migration

Check the logs to ensure success:

```bash
docker compose logs cinephage | grep -i "migrat"
```

Verify your data is present:

```bash
# Check database
ls -lh ./config/data/cinephage.db

# Check logs
ls -lh ./config/logs/

# Check indexer definitions
ls -lh ./config/data/indexers/definitions/
```

**Step 4:** Remove old mounts

Once verified, update `docker-compose.yaml` to remove the legacy mounts:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config # Keep only this
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

**Step 5:** Restart

```bash
docker compose up -d
```

**Step 6:** (Optional) Clean up old directories

After confirming everything works:

```bash
# Backup first (just in case)
tar -czf cinephage-legacy-backup-$(date +%Y%m%d).tar.gz ./data ./logs

# Then remove
rm -rf ./data ./logs
```

---

#### Option 2: Automatic Migration with Permission Fix

If the automatic migration fails with permission errors, you need to run as root temporarily.

**Symptoms:**

- Log shows: `ERROR: Failed to migrate data to /config/data`
- Permission denied errors during migration

**Solution:**

**Step 1:** Modify `docker-compose.yaml` to run as root temporarily:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    user: '0:0' # Temporarily run as root
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config
      - ./data:/app/data # Keep for migration
      - ./logs:/app/logs # Keep for migration
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

**Step 2:** Start and verify migration:

```bash
docker compose up -d
docker compose logs cinephage | grep -i "migrat"
```

**Step 3:** Revert to normal user mode:

Remove the `user: '0:0'` line from docker-compose.yaml (container now starts as root, entrypoint drops to PUID/PGID):

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    # user line removed - entrypoint handles privilege dropping
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

**Step 4:** Remove old mounts and restart:

```bash
docker compose up -d
```

---

#### Option 3: Manual Migration

If you prefer to migrate manually or automatic migration doesn't work:

**Step 1:** Stop the container:

```bash
docker compose down
```

**Step 2:** Create config directory and copy data:

```bash
mkdir -p ./config/data ./config/logs
cp -a ./data/. ./config/data/
cp -a ./logs/. ./config/logs/
```

**Step 3:** Fix ownership (replace with your actual UID:GID):

```bash
# Find your IDs
id -u  # Your UID
id -g  # Your GID

# Set ownership
sudo chown -R $(id -u):$(id -g) ./config
```

**Step 4:** Update `docker-compose.yaml`:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config
      - ./data:/app/data # Keep for migration
      - ./logs:/app/logs # Keep for migration
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

**Step 5:** Start container:

```bash
docker compose up -d
```

---

### Troubleshooting Migration

#### Migration doesn't run

**Symptom:** No migration messages in logs

**Cause:** Entrypoint doesn't detect old mounts

**Solution:** Ensure old mounts are present in `docker-compose.yaml` and actually mounted:

```bash
# Check if mounts are active
docker inspect cinephage | grep -A 10 Mounts
```

#### Permission denied during migration

**Symptom:** `ERROR: Failed to migrate data to /config/data`

**Cause:** Container user can't read old data or write to `/config`

**Solution:** Use [Option 2](#option-2-automatic-migration-with-permission-fix) to run as root with PUID/PGID.

#### Data in wrong location after migration

**Symptom:** Database or indexers not found

**Cause:** Data copied to wrong subdirectory

**Solution:** Verify structure:

```bash
# Should look like this:
./config/
├── data/
│   ├── cinephage.db
│   ├── indexers/
│   │   └── definitions/
│   └── nzb_cache/
└── logs/
    └── cinephage.log
```

If structure is wrong, stop container and manually reorganize:

```bash
docker compose down
# Fix structure
mv ./config/data/data/* ./config/data/
rmdir ./config/data/data
# Restart
docker compose up -d
```

---

## Alpine to Debian Image Migration

**Applies to:** All users upgrading to Camoufox-based Captcha Solver

### What Changed

- Base image: `node:22-alpine` → `node:22-slim` (Debian)
- Image size: ~180MB → ~220MB
- New feature: Camoufox browser support for Cloudflare bypass

### Migration Steps

**Step 1:** Pull new image:

```bash
docker compose pull
```

**Step 2:** Recreate container:

```bash
docker compose up -d --force-recreate
```

**Step 3:** First startup downloads Camoufox (~80MB):

```bash
docker compose logs -f cinephage
```

You'll see: `Downloading Camoufox (first run only, ~80MB)...`

**Step 4:** Remove old environment variable:

If you have `BROWSER_SOLVER_ENABLED` in your `.env`, remove it (no longer used).

**Step 5:** Configure Captcha Solver:

1. Open Cinephage UI
2. Go to Settings > Integrations > Captcha Solver
3. Enable and configure as needed

### Troubleshooting

#### Image pull fails

```bash
# Try with explicit tag
docker pull ghcr.io/moldytaint/cinephage:latest

# Or build locally
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
docker compose build
```

#### Camoufox download fails

**Symptom:** `Warning: Failed to download Camoufox. Captcha solving will be unavailable.`

**Cause:** Network issues or permission problems

**Solution:**

```bash
# Check container logs for details
docker compose logs cinephage | grep -i camoufox

# Verify home directory permissions
docker exec cinephage ls -la /home/node/.cache

# If permission issue, recreate with user 0:0 and PUID/PGID
```

---

## Rolling Back

If you need to revert to an older version:

**Step 1:** Stop current container:

```bash
docker compose down
```

**Step 2:** Backup current data:

```bash
tar -czf cinephage-backup-$(date +%Y%m%d).tar.gz ./config
```

**Step 3:** Update `docker-compose.yaml` to use old image:

```yaml
# Find old image tags at: https://github.com/MoldyTaint/cinephage/pkgs/container/cinephage
image: ghcr.io/moldytaint/cinephage:sha-2cd78ce
```

**Step 4:** If rolling back to pre-/config version, restore old volume mounts:

```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
  - /path/to/media:/media
  - /path/to/downloads:/downloads
```

**Step 5:** Start container:

```bash
docker compose up -d
```

---

**Related Guides:**

- [Installation](../getting-started/installation.md)
- [Backup & Restore](backup-restore.md)
- [Troubleshooting](../support/troubleshooting.md)
