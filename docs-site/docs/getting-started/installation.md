---
title: Installation
description: Install Cinephage using Docker Compose with step-by-step instructions
sidebar_position: 2
date: 2025-03-16
tags: [installation, docker, tutorial]
---

# Installation

This tutorial walks you through installing Cinephage using Docker Compose. This is the recommended and simplest installation method.

## Prerequisites

Before you begin, ensure you have:

- **Docker** installed (version 20.10 or later)
- **Docker Compose** installed (version 2.0 or later)
- **A TMDB API key** (you will get this during setup)

## Step 1: Create the Docker Compose File

Create a directory for Cinephage and navigate to it:

```bash
mkdir cinephage
cd cinephage
```

Create a file named `docker-compose.yaml` with the following content:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - ORIGIN=http://localhost:3000
      - BETTER_AUTH_URL=http://localhost:3000
      - BETTER_AUTH_SECRET=replace-with-random-secret
    volumes:
      - ./config:/config
      - /path/to/media:/media
      - /path/to/downloads:/downloads
```

## Step 2: Configure Environment Variables

Replace the placeholder values in the environment section:

| Variable             | Value                   | Description                                          |
| -------------------- | ----------------------- | ---------------------------------------------------- |
| `PUID`               | `1000`                  | Your user ID (run `id -u` to find yours)             |
| `PGID`               | `1000`                  | Your group ID (run `id -g` to find yours)            |
| `TZ`                 | `UTC`                   | Your timezone (e.g., `America/New_York`)             |
| `ORIGIN`             | `http://localhost:3000` | The URL you will access Cinephage from               |
| `BETTER_AUTH_URL`    | `http://localhost:3000` | Same as ORIGIN, used for authentication              |
| `BETTER_AUTH_SECRET` | Random secret string    | Required auth secret for sessions/API-key encryption |

**Important:** If you will access Cinephage through a reverse proxy or domain name, update `ORIGIN` and `BETTER_AUTH_URL` to match your public URL (e.g., `https://cinephage.yourdomain.com`).

Generate `BETTER_AUTH_SECRET` with one of:

- `openssl rand -base64 32`
- `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`

## Step 3: Configure Volume Mounts

Update the volume paths to match your system:

| Volume               | Path                          | Purpose                              |
| -------------------- | ----------------------------- | ------------------------------------ |
| `./config`           | Host path to config directory | Stores database, cache, and settings |
| `/path/to/media`     | Host path to media library    | Your existing movies and TV shows    |
| `/path/to/downloads` | Host path to downloads        | Where download clients save files    |

**Example:**

```yaml
volumes:
  - ./config:/config
  - /mnt/media:/media
  - /mnt/downloads:/downloads
```

## Step 4: Start Cinephage

Run the following command to start Cinephage:

```bash
docker compose up -d
```

This will:

1. Download the Cinephage image
2. Create the container
3. Start the application

## Step 5: Verify Installation

Check that Cinephage is running:

```bash
docker compose logs -f
```

You should see logs indicating the server has started. Press `Ctrl+C` to exit the log view.

## Step 6: Access Cinephage

Open your web browser and navigate to:

```
http://localhost:3000
```

Or if accessing from another device, use your server IP:

```
http://your-server-ip:3000
```

You should see the Cinephage setup wizard.

## Step 7: Complete Setup Wizard

The setup wizard will guide you through:

1. **Creating an admin account** - Set up your first user
2. **Configuring TMDB API** - Get your free API key from themoviedb.org
3. **Setting root folders** - Define where media will be stored

Follow the on-screen instructions to complete initial configuration.

## What You Have Accomplished

You have successfully:

- Installed Cinephage with Docker
- Configured environment variables
- Set up volume mounts for persistence
- Started the application
- Accessed the web interface

## Next Steps

Now that Cinephage is installed, continue to the [Initial Setup](initial-setup) tutorial to configure download clients, indexers, and other essential settings.

## Troubleshooting

### Port Already in Use

If port 3000 is in use, change the port mapping in `docker-compose.yaml`:

```yaml
ports:
  - '3001:3000' # Maps host port 3001 to container port 3000
```

Then access at `http://localhost:3001`.

### Permission Denied

If you see permission errors, ensure the `PUID` and `PGID` match your user:

```bash
id -u  # Get your user ID
id -g  # Get your group ID
```

Update the environment variables in `docker-compose.yaml` accordingly.

### Cannot Access from Another Device

If accessing from another device on your network, use your server IP address instead of `localhost`. Update `ORIGIN` and `BETTER_AUTH_URL` to match how you will access Cinephage.

### Container Keeps Restarting

Check the logs for errors:

```bash
docker compose logs
```

Common issues include:

- Incorrect volume mount paths
- Missing required environment variables
- Port conflicts

## Updating Cinephage

To update to the latest version:

```bash
docker compose pull
docker compose up -d
```

Your data and configuration will persist in the `./config` volume.

## Docker Tags

Cinephage provides several image tags:

| Tag      | Description                          |
| -------- | ------------------------------------ |
| `latest` | Current stable release (recommended) |
| `dev`    | Latest development build             |
| `v1.2.3` | Specific version                     |

Change the image line in `docker-compose.yaml` to use a different tag:

```yaml
image: ghcr.io/moldytaint/cinephage:dev
```

---

**Next:** [Initial Setup →](initial-setup)
