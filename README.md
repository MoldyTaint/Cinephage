<h1 align="center">Cinephage</h1>

<p align="center">
  <strong>Self-hosted media management. Everything in one app.</strong>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-Work%20in%20Progress-yellow" alt="Status: Work in Progress"></a>
  <a href="https://github.com/MoldyTaint/Cinephage/issues"><img src="https://img.shields.io/github/issues/MoldyTaint/Cinephage" alt="GitHub Issues"></a>
  <a href="https://github.com/MoldyTaint/Cinephage"><img src="https://img.shields.io/github/last-commit/MoldyTaint/Cinephage" alt="Last Commit"></a>
</p>

<p align="center">
  Search torrents, grab downloads, organize your library, fetch subtitles — all in one app.<br>
  Think Radarr + Sonarr + Prowlarr + Bazarr, but built from scratch as a single application.
</p>

<p align="center">
  <img src="docs/images/dashboard.png" alt="Cinephage Dashboard" width="800">
</p>

---

## Why Cinephage?

Cinephage consolidates four separate applications into one streamlined experience. Instead of juggling Radarr, Sonarr, Prowlarr, and Bazarr with their own databases and configurations, you get everything in a single interface backed by a single database.

- **Modern Stack** — SvelteKit 5 with TailwindCSS 4 delivers a fast, reactive interface that's a pleasure to use
- **Built-in Indexers** — 20+ indexer definitions run natively with no external dependencies like Jackett or Prowlarr
- **Smart Quality Scoring** — 100+ format attributes ensure you always get the best release for your preferences
- **Simple Setup** — Works out of the box with SQLite. No complex infrastructure required to get started

## Project Status

| Feature | Status | Notes |
|---------|--------|-------|
| Content Discovery | Stable | TMDB integration, trending, search |
| Library Management | Stable | File watching, scanning, TMDB matching |
| Quality Scoring | Stable | 4 profiles, 100+ format attributes |
| Download Client | qBittorrent Only | Other clients planned |
| Indexers | Stable | ~20 indexers + Torznab support |
| Subtitles | Stable | 8 providers, 80+ languages |
| Monitoring | Experimental | 5 tasks coded, may have bugs |
| Live TV/IPTV | Not Started | Planned for future |

## Features

<table>
<tr>
<td width="55%">
<img src="docs/images/discover.png" alt="Content Discovery" width="100%">
</td>
<td width="45%" valign="top">

**Content Discovery**<br>
Browse TMDB for movies and TV shows, view trending content, full metadata, trailers, and watch providers.

**Multi-Indexer Search**<br>
20+ built-in indexers (public + private), Torznab support for Prowlarr/Jackett integration, parallel search with automatic deduplication.

**Quality Scoring**<br>
4 built-in profiles (Best, Efficient, Micro, Streaming) that score resolution, audio codecs, HDR formats, and release groups. See [Quality Profiles](docs/QUALITY-PROFILES.md) for details.

</td>
</tr>
</table>

<table>
<tr>
<td width="45%" valign="top">

**Library Management**<br>
Real-time file watching, scheduled scans, auto-match to TMDB metadata, and media info extraction via ffprobe.

**Automated Downloads**<br>
qBittorrent integration with categories, priority handling for recent releases, auto-import on completion, and path mapping support.

**Monitoring**<br>
Automatic searches for missing content, quality upgrades, new episodes, and cutoff unmet items. See [Monitoring](docs/MONITORING.md) for configuration.

**Subtitles**<br>
8 providers, 80+ languages, auto-search on import, and language profiles. See [Subtitles](docs/SUBTITLES.md) for setup.

</td>
<td width="55%">
<img src="docs/images/library-movies.png" alt="Library Management" width="100%">
</td>
</tr>
</table>

---

## Quick Start

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

Open http://localhost:5173 and complete first-run setup:

1. Add your TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))
2. Configure qBittorrent connection
3. Set up root folders for movies and TV
4. Enable indexers

See [Configuration Guide](docs/CONFIGURATION.md) for detailed setup instructions.

## Requirements

**Required**
- Node.js 20+
- npm 10+
- qBittorrent with WebUI enabled
- TMDB API key (free)

**Optional**
- ffprobe for media info extraction (resolution, codecs, audio tracks)

## Tech Stack

**Frontend:** SvelteKit 5 · Svelte 5 · TailwindCSS 4 · DaisyUI 5

**Backend:** Node.js · SQLite · Drizzle ORM · Zod

**External:** TMDB · qBittorrent WebUI

## Documentation

**Getting Started**
- [Configuration](docs/CONFIGURATION.md) — Environment variables and first-run setup
- [Deployment](docs/DEPLOYMENT.md) — Production setup, systemd, reverse proxy
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and solutions

**Feature Guides**
- [Indexers](docs/INDEXERS.md) — Built-in indexers, Torznab, custom definitions
- [Quality Profiles](docs/QUALITY-PROFILES.md) — Scoring system and built-in profiles
- [Monitoring](docs/MONITORING.md) — Automated tasks and scheduling
- [Subtitles](docs/SUBTITLES.md) — Providers and language profiles

**Reference**
- [API Reference](docs/API.md) — REST API endpoints
- [Roadmap](docs/ROADMAP.md) — Planned features and known limitations

## Development

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run check        # TypeScript checking
npm run lint         # ESLint + Prettier
npm run test         # Run tests
npm run db:studio    # Drizzle Studio
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Support

- [GitHub Issues](https://github.com/MoldyTaint/cinephage/issues) — Bug reports and feature requests
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) — Common issues and solutions
- [Contributing](CONTRIBUTING.md) — Development guidelines and workflow
- [Code of Conduct](CODE_OF_CONDUCT.md) — Community standards
- [Security Policy](SECURITY.md) — Vulnerability reporting
- [Changelog](CHANGELOG.md) — Version history

---

## Acknowledgments

Cinephage is an original implementation that stands on the shoulders of giants. The architecture draws inspiration from [Radarr](https://github.com/Radarr/Radarr) and [Sonarr](https://github.com/Sonarr/Sonarr) for download management, monitoring, and quality handling logic. The indexer system, including Cardigann format support and health tracking, is inspired by [Prowlarr](https://github.com/Prowlarr/Prowlarr). Subtitle provider architecture comes from [Bazarr](https://github.com/morpheus65535/bazarr), and modern UI patterns from [Overseerr](https://github.com/sct/overseerr).

Special thanks to [Dictionarry](https://github.com/Dictionarry-Hub/database) for the quality scoring database, [EncDec Endpoints](https://github.com/AzartX47/EncDecEndpoints) for streaming functionality, and [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) for Cloudflare handling approaches.

Uses [TMDB](https://www.themoviedb.org/) for metadata and [qBittorrent](https://www.qbittorrent.org/) for downloads. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for complete attribution details.

## AI Disclosure

This project was built with and continues to use AI assistance. As a solo developer who's still learning, AI makes it possible to tackle a project of this scope — something that would otherwise require a team. It's a personal project, and AI is a tool that helps bridge the gap between ambition and experience. It's not perfect, but neither am I. We believe in being upfront about how this project is built.

## License

[GNU General Public License v3.0](LICENSE)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
