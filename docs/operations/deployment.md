# Deployment

Production deployment guide for Cinephage.

---

## Docker Deployment (Recommended)

Docker is the simplest way to deploy Cinephage in production.

### Docker Image

Cinephage uses `node:22-slim` (Debian) as its base image. This provides compatibility with the Camoufox browser used for Cloudflare bypass.

> **Note for existing users:** If you're upgrading from an older version that used Alpine, see the [Migration Notes in CHANGELOG.md](../../CHANGELOG.md#migration-notes) for upgrade instructions.

### Quick Start

Create a `docker-compose.yaml` file:

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
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

Start:

```bash
docker compose up -d
```

### First Run

On first startup, the container will:

1. Initialize indexer definitions from bundled files
2. Download the Camoufox binaries (~80MB) for Cloudflare bypass

This may take a minute or two. Check logs with `docker compose logs -f` to monitor progress.

### File Permissions

Match container user to your media library ownership:

```bash
# Find your media library owner
ls -la /path/to/your/media
# Note the UID:GID (e.g., 1000:1000)

# Set in `docker-compose.yaml`
PUID=1000
PGID=1000

# Ensure data directories are accessible
mkdir -p ./data ./logs
chown -R 1000:1000 ./data ./logs
```

### Resource Limits

Add to docker-compose.yaml:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

---

## NixOS Deployment

### Prerequisites

- NixOS with flake support
- [Flake enabled](https://nixos.wiki/wiki/Flakes) (NixOS 23.11+)

### Installation

1. **Add Flake to System Configuration**

   Include the flake

   ```nix
   inputs.cinephage.url = "github:MoldyTaint/Cinephage";
   ```

   And this to your system config

   ```nix
   # Import the Cinephage NixOS module
   imports = [ self.inputs.cinephage.nixosModules.default ];

   # Enable Cinephage service
   services.cinephage = {
     enable = true;
     ffmpeg.enable = true;
     media = [
        "/media/movies"
        "/media/series"
        "/media/Downloads"
     ];

     # Optional: Configure media paths
     environment = {
       MEDIA_PATH = "/path/to/your/media";
       # Override any default settings if needed
     };
   };
   ```

---

## Manual Deployment

For installations without Docker.

### Prerequisites

- Node.js 20+
- npm 10+
- Linux server (Ubuntu 22.04+, Debian 12+)

### Installation

```bash
# Clone repository
git clone https://github.com/MoldyTaint/cinephage.git /opt/cinephage
cd /opt/cinephage

# Install dependencies
npm ci --production=false

# Build application
npm run build

# Test
NODE_ENV=production node build/index.js
```

### Systemd Service

1. **Create system user**

```bash
sudo useradd -r -s /bin/false cinephage
sudo chown -R cinephage:cinephage /opt/cinephage
```

2. **Create directories**

```bash
sudo mkdir -p /opt/cinephage/data /opt/cinephage/logs
sudo chown cinephage:cinephage /opt/cinephage/data /opt/cinephage/logs
```

3. **Install service**

```bash
sudo cp /opt/cinephage/deploy/cinephage.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cinephage
```

4. **Configure environment**

```bash
sudo cp /opt/cinephage/.env.example /opt/cinephage/.env
sudo chown cinephage:cinephage /opt/cinephage/.env
sudo chmod 600 /opt/cinephage/.env
sudo nano /opt/cinephage/.env
```

Set:

```
HOST=127.0.0.1
PORT=3000
ORIGIN=https://cinephage.yourdomain.com
```

5. **Start service**

```bash
sudo systemctl start cinephage
sudo systemctl status cinephage
```

### Service Commands

```bash
sudo systemctl start cinephage    # Start
sudo systemctl stop cinephage     # Stop
sudo systemctl restart cinephage  # Restart
sudo journalctl -u cinephage -f   # View logs
```

---

## Reverse Proxy

### nginx

Create `/etc/nginx/sites-available/cinephage`:

```nginx
server {
    listen 80;
    server_name cinephage.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cinephage.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/cinephage.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cinephage.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 10M;
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/cinephage /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

Add to `/etc/caddy/Caddyfile`:

```
cinephage.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Caddy automatically handles SSL via Let's Encrypt.

---

## SSL/TLS Setup

### Using Certbot (nginx)

```bash
# Install
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d cinephage.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Using Caddy

Caddy provisions SSL automatically. No configuration needed.

---

## Health Check

Test that Cinephage is running:

```bash
curl http://localhost:3000/health
```

---

## Monitoring

### Log Files

Logs are stored in the configured log directory (default: `logs/`).

### Systemd Logs

```bash
# Real-time logs
sudo journalctl -u cinephage -f

# Today's logs
sudo journalctl -u cinephage --since today

# Error logs only
sudo journalctl -u cinephage -p err
```

---

## Troubleshooting

### Service Won't Start

1. Check permissions: `ls -la /opt/cinephage/`
2. Check logs: `sudo journalctl -u cinephage -n 50`
3. Test manually: `sudo -u cinephage NODE_ENV=production node /opt/cinephage/build/index.js`

### Port in Use

```bash
sudo lsof -i :3000
```

Change port in `.env` if needed.

---

**See also:** [Installation](../getting-started/installation.md) | [Backup & Restore](backup-restore.md) | [Updating](updating.md)
