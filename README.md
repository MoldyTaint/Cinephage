# Cinephage

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![GitHub Issues](https://img.shields.io/github/issues/MoldyTaint/cinephage)](https://github.com/MoldyTaint/cinephage/issues)

Self-hosted media management. Search torrents, grab downloads, organize your library, fetch subtitles - all in one app. Think Radarr + Sonarr + Prowlarr + Bazarr, but built from scratch as a single application.

## Preview

<!-- TODO: Add screenshots before public launch -->
<!-- ![Cinephage Screenshot](docs/images/screenshot.png) -->

*Screenshots coming soon*

## Table of Contents

- [Preview](#preview)
- [Overview](#overview)
- [Features](#features)
  - [Content Discovery](#content-discovery)
  - [Multi-Indexer Search](#multi-indexer-search)
  - [Smart Quality Scoring](#smart-quality-scoring)
  - [Automated Downloads](#automated-downloads)
  - [Library Management](#library-management)
  - [Monitoring and Automation](#monitoring-and-automation)
  - [Subtitle Management](#subtitle-management)
  - [Streaming Integration](#streaming-integration)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Detailed Installation](#detailed-installation)
  - [Production Deployment](#production-deployment)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [First Run Setup](#first-run-setup)
- [Indexers](#indexers)
  - [Built-in Indexers](#built-in-indexers)
  - [Torznab Integration](#torznab-integration)
  - [Custom Indexers](#custom-indexers)
- [Quality Profiles](#quality-profiles)
  - [Built-in Profiles](#built-in-profiles)
  - [Scoring System](#scoring-system)
- [Monitoring Tasks](#monitoring-tasks)
- [Subtitle System](#subtitle-system)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Contributing](#contributing)
- [Support](#support)
- [Acknowledgments](#acknowledgments)
- [AI Disclosure](#ai-disclosure)
- [License](#license)

---

## Overview

Cinephage handles your whole media workflow:

- Browse movies and TV via TMDB
- Search multiple torrent sites at once
- Score releases by quality (resolution, audio, HDR, release group)
- Send downloads to qBittorrent
- Organize files and pull metadata
- Monitor for missing content and upgrades
- Grab subtitles automatically
- Generate .strm files for streaming

No Radarr/Sonarr/Prowlarr needed - everything runs in one app with a single SQLite database.

### What's Different

- **Modern stack** - SvelteKit 5, Svelte 5, TailwindCSS 4
- **Built-in indexers** - Runs Cardigann YAML definitions natively (no Jackett required)
- **Quality scoring** - 100+ format attributes, customizable profiles
- **Single database** - Just SQLite, no external services

---

## Features

### Content Discovery

Browse and search via TMDB:

- Trending movies and shows
- Search with filters
- Full metadata (cast, crew, ratings, runtime)
- Season/episode breakdowns
- Watch provider info

### Multi-Indexer Search

- Search multiple sites in parallel
- Built-in public indexers + Torznab support (Prowlarr/Jackett)
- Rate limiting per host
- Auto-disable failing indexers with backoff
- Result deduplication

### Quality Scoring

Four built-in profiles:

| Profile | Focus | Use Case |
|---------|-------|----------|
| **Best** | Maximum quality | Remux, lossless audio, quality purists |
| **Efficient** | Quality with efficient encoding | x265/HEVC from quality groups |
| **Micro** | Quality-focused micro encodes | Small files, good quality |
| **Streaming** | Instant availability | Stream providers, auto-upgradeable |

Scores based on:
- Resolution + source (2160p Remux, 1080p BluRay, etc.)
- Audio codec (TrueHD Atmos, DTS-HD MA, etc.)
- HDR format (Dolby Vision, HDR10+, HDR10)
- Release group tier
- File size

### Downloads

qBittorrent integration:

- Separate categories for movies and TV
- Priority handling
- Seeding limits
- Magnet and .torrent support
- Auto-import when done
- Duplicate detection
- Path mapping for remote clients

### Library

- Real-time file watching
- Scheduled scans
- Auto-match files to TMDB
- Media info via ffprobe
- Quality detection from filenames
- Duplicate handling
- Unmatched file management

### Monitoring

Automated tasks:

| Task | Default Interval | Description |
|------|------------------|-------------|
| Missing Content | 24 hours | Searches for movies/series without files |
| Upgrade Monitoring | Weekly | Detects when better quality is available |
| New Episode Detection | 1 hour | Monitors for newly released episodes |
| Cutoff Unmet | 24 hours | Finds content below quality cutoff |
| Pending Release Cleanup | 15 minutes | Removes stuck pending items |

- Configurable intervals
- Remembers last run time
- Runs in background
- Min upgrade threshold setting

### Subtitles

8 providers built-in:

| Provider | Type | Features |
|----------|------|----------|
| OpenSubtitles | API | Hash matching, largest database |
| Podnapisi | Scraper | Good coverage, hearing impaired |
| Subscene | Scraper | Large community database |
| Addic7ed | Scraper | TV focus, multiple languages |
| SubDL | API | Modern API, good quality |
| YIFY Subtitles | Scraper | YTS movie focus |
| Gestdown | API | Addic7ed alternative |
| Subf2m | Scraper | Wide coverage |

- 80+ languages
- Language profiles
- Hearing impaired filtering
- Auto-search on import
- Rate limiting per provider
- Blacklist and history

### Streaming

Generate .strm files for media players:

- Multiple streaming providers
- Stream validation
- CORS proxy
- HLS support
- AniList for anime

---

## Tech Stack

### Frontend
- **SvelteKit 5** - Full-stack web framework
- **Svelte 5** - Reactive UI components with runes
- **TailwindCSS 4** - Utility-first CSS framework
- **DaisyUI 5** - Component library for Tailwind
- **Lucide Svelte** - Icon library

### Backend
- **Node.js** - JavaScript runtime
- **SvelteKit Server** - Node adapter for production
- **SQLite** - Embedded database
- **Drizzle ORM** - TypeScript ORM with migrations
- **Zod** - Schema validation

### External Services
- **TMDB** - Movie and TV metadata
- **qBittorrent WebUI v2** - Download management

### Build and Test
- **Vite 7** - Build tool and dev server
- **Vitest** - Unit testing framework
- **TypeScript** - Type safety
- **ESLint** - Code linting
- **Prettier** - Code formatting

---

## Requirements

### Required

- **Node.js 20** or higher
- **npm 10** or higher
- **qBittorrent** with WebUI enabled
- **TMDB API Key** (free at https://www.themoviedb.org/settings/api)

### Optional

- **ffprobe** - For media info extraction (resolution, codec, audio details)
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Windows: Download from https://ffmpeg.org/download.html

### System Recommendations

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512 MB | 1 GB |
| Disk Space | 100 MB + library | 500 MB + library |
| CPU | 1 core | 2+ cores |

---

## Installation

### Quick Start

```bash
# Clone and install
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
npm install

# Initialize database
npm run db:push

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Detailed Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/MoldyTaint/cinephage.git
   cd cinephage
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment** (optional for development)

   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

4. **Initialize the database**

   ```bash
   npm run db:push
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

6. **Complete first-run setup** in the browser at http://localhost:5173
   - Add your TMDB API key in Settings
   - Configure your qBittorrent connection
   - Set up root folders for your media
   - Enable indexers

### Production Deployment

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md) for:
- Building for production
- Systemd service configuration
- Reverse proxy setup
- SSL/TLS configuration
- Database backup procedures

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

#### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Host address to bind (use `127.0.0.1` behind reverse proxy) |
| `PORT` | `3000` | Port to listen on |
| `ORIGIN` | - | Trusted origin for CSRF (e.g., `http://192.168.1.100:3000`) |

#### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DIR` | `./logs` | Log file directory |
| `LOG_MAX_SIZE_MB` | `10` | Maximum log file size before rotation |
| `LOG_MAX_FILES` | `5` | Number of rotated logs to keep |
| `LOG_TO_FILE` | `true` | Enable/disable file logging |

#### Media Info

| Variable | Default | Description |
|----------|---------|-------------|
| `FFPROBE_PATH` | System PATH | Path to ffprobe binary |

#### Worker Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_MAX_STREAMS` | `10` | Max concurrent stream workers |
| `WORKER_MAX_IMPORTS` | `5` | Max concurrent import workers |
| `WORKER_MAX_SCANS` | `2` | Max concurrent scan workers |
| `WORKER_MAX_MONITORING` | `5` | Max concurrent monitoring workers |
| `WORKER_CLEANUP_MS` | `1800000` | Worker cleanup interval (30 min) |
| `WORKER_MAX_LOGS` | `1000` | Max log entries per worker |

#### Graceful Shutdown

| Variable | Default | Description |
|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT` | `30` | Seconds to wait for connections to close |

### First Run Setup

After starting Cinephage, complete these configuration steps:

1. **TMDB API Key**
   - Navigate to Settings > General
   - Enter your TMDB API key
   - The key is validated automatically

2. **Download Client**
   - Navigate to Settings > Integrations > Download Clients
   - Click "Add Download Client"
   - Enter your qBittorrent connection details:
     - Host (e.g., `localhost` or IP address)
     - Port (default: `8080`)
     - Username and password
   - Test the connection before saving

3. **Root Folders**
   - Navigate to Settings > General
   - Add root folders for your media:
     - One folder for movies
     - One folder for TV series
   - Cinephage will organize downloads into these locations

4. **Indexers**
   - Navigate to Settings > Integrations > Indexers
   - Enable the indexers you want to use
   - Configure any required settings (API keys, credentials)
   - Test each indexer to verify it works

5. **Quality Profile** (optional)
   - Navigate to Settings > Profiles
   - Review the built-in profiles
   - Create custom profiles if needed

---

## Indexers

### Built-in Indexers

Cinephage includes 20+ indexer definitions that run natively:

| Indexer | Type | Content | Notes |
|---------|------|---------|-------|
| YTS | Public | Movies | 1080p and 2160p, small files |
| EZTV | Public | TV | Large TV library |
| 1337x | Public | General | Movies, TV, general |
| TorrentGalaxy | Public | General | Movies, TV, games |
| Nyaa | Public | Anime | Japanese content focus |
| SubsPlease | Public | Anime | Simulcast releases |
| Anidex | Public | Anime | Multi-language anime |
| Solidtorrents | Public | General | DHT-based aggregator |
| LimeTorrents | Public | General | Movies, TV, general |
| MagnetDL | Public | General | Magnet link focus |
| BitSearch | Public | General | Search aggregator |
| BTDig | Public | General | DHT search engine |
| TheRARBG | Public | General | RARBG mirror |
| Knaben | Public | General | Multi-tracker aggregator |
| TorrentsCSV | Public | General | DHT database search |

Private tracker support includes: Aither, BeyondHD, IPTorrents, OldToonsWorld, SceneTime, SpeedCD, TorrentDay.

### Torznab Integration

Connect to external indexer managers using the Torznab protocol:

1. Navigate to Settings > Integrations > Indexers
2. Click "Add Indexer" and select "Torznab"
3. Enter:
   - Name for the indexer
   - URL of your Prowlarr/Jackett instance
   - API key from your indexer manager
4. Test and save

This allows using indexers configured in Prowlarr or Jackett without reconfiguring them in Cinephage.

### Custom Indexers

Create custom indexer definitions using Cardigann-compatible YAML:

1. Create a YAML file in `data/indexers/definitions/`
2. Follow the existing definition patterns
3. Restart Cinephage to load the new indexer

Example structure:
```yaml
id: example-indexer
name: Example Indexer
description: An example indexer definition
language: en-US
type: public

caps:
  categories:
    Movies: 2000
    TV: 5000

search:
  paths:
    - path: search
      method: get
  inputs:
    query: "{{ .Query.Q }}"

download:
  selectors:
    - selector: a.download-link
      attribute: href
```

See existing definitions in `data/indexers/definitions/` for complete examples.

---

## Quality Profiles

### Built-in Profiles

Four profiles cover common use cases:

#### Best Profile
- Prioritizes highest quality regardless of file size
- Prefers Remux, then BluRay encodes
- Values lossless audio (TrueHD, DTS-HD MA)
- Prefers HDR formats (Dolby Vision, HDR10+)
- Uses top-tier release groups

#### Efficient Profile
- Balances quality with file size
- Prefers x265/HEVC encoding
- Accepts lossy but high-quality audio (DTS, Atmos)
- Values efficient encoding from quality groups
- Good for limited storage with quality priority

#### Micro Profile
- Quality-focused with smaller file sizes
- Prefers top micro-encode groups (Tigole, QxR)
- Accepts standard audio codecs
- Good balance for moderate storage

#### Streaming Profile
- Instant availability via stream providers
- Auto-upgradeable to torrent when available
- Multiple streaming sources
- Mobile and quick-access scenarios

### Scoring System

Releases are scored based on multiple factors:

**Resolution + Source (0-20000 points)**
```
2160p Remux:     20000
2160p BluRay:    18000
2160p Web-DL:    15000
1080p Remux:     14000
1080p BluRay:    12000
1080p Web-DL:    10000
720p BluRay:      7000
720p Web-DL:      5000
```

**Audio Codec (0-2000 points)**
```
TrueHD Atmos:    2000
DTS-HD MA:       1800
TrueHD:          1600
DTS-X:           1500
Atmos:           1400
DTS-HD:          1200
DTS:              800
AAC:              400
```

**HDR Format (0-1000 points)**
```
Dolby Vision:    1000
HDR10+:           800
HDR10:            600
```

**Release Group Tiers (0-500 points)**
```
Tier 1 (FraMeSToR, etc.):  500
Tier 2 (SPARKS, etc.):     300
Tier 3 (RARBG, etc.):      100
Unknown:                     0
```

**Penalties**
```
Banned groups:         -10000
Cam/Screener:          -5000
Low quality audio:       -500
Streaming rips:          -200
```

---

## Monitoring Tasks

Configure automated monitoring in Settings > Monitoring:

### Missing Content Search
- Searches for movies and TV series marked as "wanted" that have no files
- Runs every 24 hours by default
- Respects indexer rate limits

### Upgrade Monitoring
- Checks if better quality releases are available for existing files
- Runs weekly by default
- Configurable minimum improvement threshold (e.g., 10% better score)

### New Episode Detection
- Monitors for newly released TV episodes
- Runs hourly by default
- Searches across all enabled indexers

### Cutoff Unmet Search
- Finds content below your quality profile's cutoff
- Runs every 24 hours by default
- Only searches for content that could realistically be upgraded

### Pending Release Cleanup
- Removes pending releases that never materialized
- Runs every 15 minutes by default
- Cleans up stuck or orphaned entries

---

## Subtitle System

### Configuration

1. Navigate to Settings > Integrations > Subtitle Providers
2. Enable desired providers
3. Configure API keys where required (OpenSubtitles, SubDL)
4. Set provider priority order

### Language Profiles

Create language profiles to specify preferred subtitle languages:

1. Navigate to Settings > Integrations > Language Profiles
2. Create a new profile
3. Add languages in priority order
4. Assign the profile to media items

### Automatic Search

Enable automatic subtitle search:

1. Configure at least one subtitle provider
2. Create and assign a language profile
3. Subtitles are searched automatically when media is imported
4. Manual search available from media detail pages

### Supported Languages

150+ languages including regional variants:
- Major languages: English, Spanish, French, German, Portuguese, Italian, Dutch, Polish, Russian, Japanese, Korean, Chinese
- Regional variants: Portuguese (Brazil), Chinese (Traditional), Spanish (Latin America)
- ISO 639-1 and ISO 639-2 code support

---

## API Reference

Cinephage provides a REST API for all functionality:

### Endpoint Categories

| Category | Base Path | Description |
|----------|-----------|-------------|
| Discovery | `/api/discover` | TMDB search and browse |
| Library | `/api/library` | Library management |
| Indexers | `/api/indexers` | Indexer configuration |
| Search | `/api/search` | Multi-indexer search |
| Queue | `/api/queue` | Download queue |
| Download | `/api/download` | Download management |
| Subtitles | `/api/subtitles` | Subtitle operations |
| Monitoring | `/api/monitoring` | Automation settings |
| Streaming | `/api/streaming` | Stream generation |

### Key Endpoints

**Discovery**
- `GET /api/discover` - Browse trending content
- `GET /api/discover/search` - Search TMDB

**Library**
- `GET /api/library/movies` - List library movies
- `GET /api/library/series` - List library series
- `POST /api/library/scan` - Trigger library scan
- `GET /api/library/status` - Scan status

**Search**
- `POST /api/search` - Search across indexers

**Queue**
- `GET /api/queue` - Current download queue
- `GET /api/queue/history` - Download history
- `DELETE /api/queue/:id` - Remove from queue

**Indexers**
- `GET /api/indexers` - List configured indexers
- `POST /api/indexers` - Add indexer
- `POST /api/indexers/test` - Test indexer connection

---

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Open Drizzle Studio for database browsing
npm run db:studio
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run preview` | Preview production build |
| `npm run check` | TypeScript type checking |
| `npm run check:watch` | Type checking in watch mode |
| `npm run lint` | Run ESLint and Prettier checks |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run all tests |
| `npm run test:unit` | Run tests in watch mode |

### Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:push` | Push schema to database |
| `npm run db:generate` | Generate migration files |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio |

### Code Style

- TypeScript for type safety
- Prettier for formatting
- ESLint for linting
- Svelte 5 runes for reactivity

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

---

## Troubleshooting

### Common Issues

**Database errors on startup**
```bash
# Reset and reinitialize the database
rm data/cinephage.db
npm run db:push
```

**Indexer connection failures**
- Check if the indexer is accessible in your browser
- Verify rate limits are not exceeded
- Check for Cloudflare protection
- Review logs in `logs/` directory

**qBittorrent connection refused**
- Verify WebUI is enabled in qBittorrent settings
- Check host, port, username, and password
- Ensure qBittorrent allows connections from Cinephage's IP

**Media not matching**
- Verify file naming follows standard patterns
- Check that TMDB API key is valid
- Use manual matching for problematic files

**Subtitles not downloading**
- Configure at least one subtitle provider
- Assign a language profile to the media item
- Check provider API key validity

For more troubleshooting guidance, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Security

Cinephage is designed for local network use. When exposing to the internet:

- Use a reverse proxy (nginx, Caddy) with SSL/TLS
- Configure the `ORIGIN` environment variable for CSRF protection
- Consider authentication at the reverse proxy level
- Keep the application updated

For security policies and vulnerability reporting, see [SECURITY.md](SECURITY.md).

---

## Contributing

Contributions are welcome. Please review the guidelines before submitting:

1. Fork the repository
2. Create a feature branch
3. Follow code style guidelines
4. Add tests for new functionality
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:
- Development setup
- Code style and patterns
- Commit message format
- Pull request process
- Adding new indexers

---

## Support

- [GitHub Issues](https://github.com/MoldyTaint/cinephage/issues) - Bug reports and feature requests only
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Deployment Guide](DEPLOYMENT.md) - Production setup help

Note: GitHub Issues are for bugs and feature requests. For general questions, please check the documentation first.

---

## Acknowledgments

Inspired by and learned from:

- **[EncDec Endpoints](https://github.com/AzartX47/EncDecEndpoints)** - Primary inspiration for streaming functionality
- **[Radarr](https://github.com/Radarr/Radarr)** - Download management, monitoring, quality logic
- **[Sonarr](https://github.com/Sonarr/Sonarr)** - TV handling, episode monitoring, season packs
- **[Prowlarr](https://github.com/Prowlarr/Prowlarr)** - Indexer system, Cardigann format, health tracking
- **[Bazarr](https://github.com/morpheus65535/bazarr)** - Subtitle provider architecture
- **[Seerr](https://github.com/seerr-team/seerr)** - Modern UI patterns
- **[FlareSolverr](https://github.com/FlareSolverr/FlareSolverr)** - Cloudflare handling
- **[Flyx](https://github.com/Vynx-Velvet/Flyx-main)** - Movie/TV discovery inspiration
- **[Dictionarry](https://github.com/Dictionarry-Hub/database)** - Quality scoring database

Uses TMDB for metadata and qBittorrent for downloads.

---

## AI Disclosure

This project was built with and continues to use AI assistance. As a solo developer who's still learning, AI makes it possible to tackle a project of this scope - something that would otherwise require a team. It's a personal project, and AI is a tool that helps bridge the gap between ambition and experience. It's not perfect, but neither am I. We believe in being upfront about how this project is built.

---

## License

Cinephage is licensed under the GNU General Public License v3.0.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

See the [LICENSE](LICENSE) file for the full license text.
