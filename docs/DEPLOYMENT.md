# Deployment Guide

This guide covers deploying Cinephage in a production environment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building for Production](#building-for-production)
- [Systemd Service](#systemd-service)
- [Reverse Proxy Configuration](#reverse-proxy-configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [Environment Configuration](#environment-configuration)
- [Database Management](#database-management)
- [Updating Cinephage](#updating-cinephage)
- [Monitoring](#monitoring)

---

## Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- Linux server (Ubuntu 22.04+, Debian 12+, or similar)
- qBittorrent with WebUI enabled
- TMDB API key
- (Optional) nginx or Caddy for reverse proxy
- (Optional) ffprobe for media info extraction

---

## Building for Production

1. **Clone the repository**

   ```bash
   git clone https://github.com/MoldyTaint/cinephage.git /opt/cinephage
   cd /opt/cinephage
   ```

2. **Install dependencies**

   ```bash
   npm ci --production=false
   ```

3. **Build the application**

   ```bash
   npm run build
   ```

4. **Initialize the database**

   ```bash
   npm run db:push
   ```

5. **Verify the build**

   ```bash
   NODE_ENV=production node build/index.js
   ```

   The application should start on port 3000 (or configured port).

---

## Systemd Service

A systemd service file is provided in `deploy/cinephage.service`.

### Installation

1. **Create a system user**

   ```bash
   sudo useradd -r -s /bin/false cinephage
   ```

2. **Set directory ownership**

   ```bash
   sudo chown -R cinephage:cinephage /opt/cinephage
   ```

3. **Create data and log directories**

   ```bash
   sudo mkdir -p /opt/cinephage/data /opt/cinephage/logs
   sudo chown cinephage:cinephage /opt/cinephage/data /opt/cinephage/logs
   ```

4. **Copy the service file**

   ```bash
   sudo cp /opt/cinephage/deploy/cinephage.service /etc/systemd/system/
   ```

5. **Create environment file**

   ```bash
   sudo cp /opt/cinephage/.env.example /opt/cinephage/.env
   sudo chown cinephage:cinephage /opt/cinephage/.env
   sudo chmod 600 /opt/cinephage/.env
   ```

6. **Edit the environment file**

   ```bash
   sudo nano /opt/cinephage/.env
   ```

   Configure at minimum:
   ```
   HOST=127.0.0.1
   PORT=3000
   ORIGIN=https://cinephage.yourdomain.com
   ```

7. **Enable and start the service**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable cinephage
   sudo systemctl start cinephage
   ```

8. **Check status**

   ```bash
   sudo systemctl status cinephage
   sudo journalctl -u cinephage -f
   ```

### Service Commands

```bash
# Start the service
sudo systemctl start cinephage

# Stop the service
sudo systemctl stop cinephage

# Restart the service
sudo systemctl restart cinephage

# View logs
sudo journalctl -u cinephage -f

# View recent logs
sudo journalctl -u cinephage -n 100
```

---

## Reverse Proxy Configuration

### nginx

Create a configuration file at `/etc/nginx/sites-available/cinephage`:

```nginx
server {
    listen 80;
    server_name cinephage.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cinephage.yourdomain.com;

    # SSL configuration (see SSL/TLS Setup section)
    ssl_certificate /etc/letsencrypt/live/cinephage.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cinephage.yourdomain.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Proxy settings
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

        # Timeout settings for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Increase max body size for file uploads if needed
    client_max_body_size 10M;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/cinephage /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

Create or edit `/etc/caddy/Caddyfile`:

```
cinephage.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy automatically handles SSL certificate provisioning via Let's Encrypt.

---

## SSL/TLS Setup

### Using Certbot (Let's Encrypt)

1. **Install Certbot**

   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Obtain certificate**

   ```bash
   sudo certbot --nginx -d cinephage.yourdomain.com
   ```

3. **Verify auto-renewal**

   ```bash
   sudo certbot renew --dry-run
   ```

### Using Caddy

Caddy automatically provisions and renews SSL certificates. No additional configuration needed.

---

## Environment Configuration

### Production Environment Variables

| Variable | Recommended Value | Description |
|----------|-------------------|-------------|
| `HOST` | `127.0.0.1` | Bind to localhost only (reverse proxy handles external) |
| `PORT` | `3000` | Application port |
| `ORIGIN` | `https://your.domain` | Your public URL for CSRF protection |
| `NODE_ENV` | `production` | Set by systemd service |
| `LOG_TO_FILE` | `true` | Enable file logging |
| `LOG_DIR` | `/opt/cinephage/logs` | Log directory |
| `LOG_MAX_SIZE_MB` | `10` | Log rotation size |
| `LOG_MAX_FILES` | `10` | Number of log files to keep |

### Security Considerations

- Set file permissions on `.env` to `600`
- Use `127.0.0.1` for HOST when behind a reverse proxy
- Always set ORIGIN to your public URL
- Store API keys securely

---

## Database Management

### Backup

The SQLite database is stored at `data/cinephage.db`.

```bash
# Create backup
cp /opt/cinephage/data/cinephage.db /backup/cinephage-$(date +%Y%m%d).db

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backup/cinephage"
mkdir -p $BACKUP_DIR
cp /opt/cinephage/data/cinephage.db $BACKUP_DIR/cinephage-$(date +%Y%m%d-%H%M%S).db
# Keep only last 7 days
find $BACKUP_DIR -name "cinephage-*.db" -mtime +7 -delete
```

### Restore

```bash
# Stop the service
sudo systemctl stop cinephage

# Restore backup
cp /backup/cinephage-20250101.db /opt/cinephage/data/cinephage.db
chown cinephage:cinephage /opt/cinephage/data/cinephage.db

# Start the service
sudo systemctl start cinephage
```

### Database Migrations

When updating Cinephage, run migrations if schema changes are included:

```bash
cd /opt/cinephage
npm run db:push
```

---

## Updating Cinephage

1. **Stop the service**

   ```bash
   sudo systemctl stop cinephage
   ```

2. **Backup the database**

   ```bash
   cp /opt/cinephage/data/cinephage.db /opt/cinephage/data/cinephage.db.backup
   ```

3. **Pull updates**

   ```bash
   cd /opt/cinephage
   git fetch origin
   git pull origin main
   ```

4. **Install dependencies**

   ```bash
   npm ci --production=false
   ```

5. **Rebuild**

   ```bash
   npm run build
   ```

6. **Run migrations**

   ```bash
   npm run db:push
   ```

7. **Start the service**

   ```bash
   sudo systemctl start cinephage
   ```

8. **Verify**

   ```bash
   sudo systemctl status cinephage
   ```

---

## Monitoring

### Log Files

Application logs are stored in the configured log directory (default: `logs/`):

- `cinephage.log` - Current log file
- `cinephage.log.1`, etc. - Rotated log files

### Systemd Journal

```bash
# Follow logs in real-time
sudo journalctl -u cinephage -f

# View logs from today
sudo journalctl -u cinephage --since today

# View logs with errors
sudo journalctl -u cinephage -p err
```

### Health Check

The application provides a health endpoint:

```bash
curl http://localhost:3000/health
```

### Resource Monitoring

Monitor system resources:

```bash
# Check memory usage
ps aux | grep cinephage

# Check open files
lsof -p $(pgrep -f "node build/index.js") | wc -l
```

---

## Troubleshooting Deployment

### Service Won't Start

1. Check permissions:
   ```bash
   ls -la /opt/cinephage/
   ```

2. Check logs:
   ```bash
   sudo journalctl -u cinephage -n 50
   ```

3. Test manually:
   ```bash
   sudo -u cinephage NODE_ENV=production node /opt/cinephage/build/index.js
   ```

### Permission Denied Errors

```bash
sudo chown -R cinephage:cinephage /opt/cinephage
sudo chmod 755 /opt/cinephage
sudo chmod 600 /opt/cinephage/.env
```

### Database Lock Errors

Ensure only one instance is running:

```bash
ps aux | grep cinephage
sudo systemctl status cinephage
```

### Port Already in Use

Check what's using the port:

```bash
sudo lsof -i :3000
```

Change the port in `.env` if needed.
