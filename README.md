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

| | |
|---|---|
| **Modern Stack** | SvelteKit 5, Svelte 5, TailwindCSS 4 — fast, reactive, and maintainable |
| **Built-in Indexers** | 23+ indexer definitions run natively. No Jackett or Prowlarr required |
| **Smart Quality Scoring** | 100+ format attributes with customizable profiles |
| **Single Database** | Just SQLite. No external services or complex setup |

---

## Features

- **Content Discovery** — Browse TMDB for movies and TV, trending content, full metadata, watch providers
- **Multi-Indexer Search** — 23+ built-in indexers (public + private), Torznab support for Prowlarr/Jackett, parallel search with deduplication
- **Quality Scoring** — 4 built-in profiles (Best, Efficient, Micro, Streaming), scores resolution, audio, HDR, release group → [Details](docs/QUALITY-PROFILES.md)
- **Automated Downloads** — qBittorrent integration with categories, priority handling, auto-import, path mapping
- **Library Management** — Real-time file watching, scheduled scans, auto-match to TMDB, media info via ffprobe
- **Monitoring** — Searches for missing content, quality upgrades, new episodes, cutoff unmet → [Details](docs/MONITORING.md)
- **Subtitles** — 8 providers, 150+ languages, auto-search on import, language profiles → [Details](docs/SUBTITLES.md)
- **Streaming** — Generate .strm files for media players, CORS proxy, HLS support

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

See [Configuration Guide](docs/CONFIGURATION.md) for detailed setup.

---

## Requirements

| Required | Optional |
|----------|----------|
| Node.js 20+ | ffprobe (for media info) |
| npm 10+ | |
| qBittorrent with WebUI | |
| TMDB API key | |

---

## Tech Stack

**Frontend**: SvelteKit 5 · Svelte 5 · TailwindCSS 4 · DaisyUI 5

**Backend**: Node.js · SQLite · Drizzle ORM · Zod

**External**: TMDB · qBittorrent WebUI

---

## Documentation

Full documentation is available in the [docs/](docs/) folder.

| Guide | Description |
|-------|-------------|
| [Configuration](docs/CONFIGURATION.md) | Environment variables, first-run setup |
| [Deployment](docs/DEPLOYMENT.md) | Production setup, systemd, reverse proxy |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [Indexers](docs/INDEXERS.md) | Built-in indexers, Torznab, custom definitions |
| [Quality Profiles](docs/QUALITY-PROFILES.md) | Scoring system, built-in profiles |
| [Monitoring](docs/MONITORING.md) | Automated tasks configuration |
| [Subtitles](docs/SUBTITLES.md) | Providers, language profiles |
| [API Reference](docs/API.md) | REST API endpoints |
| [Roadmap](docs/ROADMAP.md) | Planned features, known limitations |

---

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

---

## Project Governance

| Document | Description |
|----------|-------------|
| [Contributing](CONTRIBUTING.md) | Development guidelines and workflow |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards |
| [Security Policy](SECURITY.md) | Vulnerability reporting |
| [Changelog](CHANGELOG.md) | Version history |

---

## Support

- [GitHub Issues](https://github.com/MoldyTaint/cinephage/issues) - Bug reports and feature requests
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions

---

## Acknowledgments

Cinephage is an original implementation inspired by these excellent projects:

| Project | License | Inspiration |
|---------|---------|-------------|
| [Radarr](https://github.com/Radarr/Radarr) | GPL-3.0 | Download management, monitoring, quality logic |
| [Sonarr](https://github.com/Sonarr/Sonarr) | GPL-3.0 | TV handling, episode monitoring, season packs |
| [Prowlarr](https://github.com/Prowlarr/Prowlarr) | GPL-3.0 | Indexer system, Cardigann format, health tracking |
| [EncDec Endpoints](https://github.com/AzartX47/EncDecEndpoints) | MIT | Streaming functionality |
| [Bazarr](https://github.com/morpheus65535/bazarr) | GPL-3.0 | Subtitle provider architecture |
| [Overseerr](https://github.com/sct/overseerr) | MIT | Modern UI patterns |
| [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) | MIT | Cloudflare handling |
| [Dictionarry](https://github.com/Dictionarry-Hub/database) | — | Quality scoring database |

Uses [TMDB](https://www.themoviedb.org/) for metadata and [qBittorrent](https://www.qbittorrent.org/) for downloads.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for complete attribution details.

---

## AI Disclosure

This project was built with and continues to use AI assistance. As a solo developer who's still learning, AI makes it possible to tackle a project of this scope — something that would otherwise require a team. It's a personal project, and AI is a tool that helps bridge the gap between ambition and experience. It's not perfect, but neither am I. We believe in being upfront about how this project is built.

---

## License

[GNU General Public License v3.0](LICENSE)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
