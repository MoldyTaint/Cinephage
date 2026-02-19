<p align="center">
  <img src="CinephageLogo.png" alt="Cinephage" width="200">
</p>

<h1 align="center">Cinephage</h1>

<p align="center">
  <strong>Self-hosted media management. Everything in one app.</strong><br>
  <em>The all-in-one platform that just happens to replace a bunch of tools</em>
</p>

<p align="center">
  <a href="https://github.com/MoldyTaint/Cinephage/releases"><img src="https://img.shields.io/github/v/release/MoldyTaint/Cinephage?style=flat-square" alt="GitHub Release"></a>
  <a href="https://github.com/MoldyTaint/Cinephage/actions"><img src="https://github.com/MoldyTaint/Cinephage/workflows/CI/badge.svg?style=flat-square" alt="CI Status"></a>
  <a href="https://github.com/MoldyTaint/Cinephage/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://discord.gg/scGCBTSWEt"><img src="https://img.shields.io/discord/1449917989561303165?color=5865F2&logo=discord&logoColor=white&style=flat-square" alt="Discord"></a>
</p>

<p align="center">
  <em>Cinephage</em> — from Greek <em>cine</em> (film) + <em>phage</em> (to devour). A film devourer.
</p>

<p align="center">
  <a href="#what-is-cinephage">What is Cinephage</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#community">Community</a>
</p>

---

<p align="center">
  <img src="docs/images/dashboard.png" width="400" alt="Dashboard">&nbsp;&nbsp;
  <img src="docs/images/discover.png" width="400" alt="Discover">
  <br><br>
  <img src="docs/images/library-movies.png" width="400" alt="Library">&nbsp;&nbsp;
  <img src="docs/images/movie-details.png" width="400" alt="Movie Details">
  <br><br>
  <a href="docs/images/">View all screenshots →</a>
</p>

---

## What is Cinephage?

Cinephage unifies your entire media workflow into a single, modern application. Instead of running multiple services that don't talk to each other, you get one cohesive platform that handles everything.

**One database.** All your movies, TV shows, live TV channels, subtitles, and indexer configs live together. No sync issues, no data fragmentation.

**One interface.** Browse, search, monitor, and manage everything from a single, responsive UI built with Svelte 5.

**One configuration.** Set up your indexers, download clients, and preferences once. They work across movies, TV, and streaming.

**One place.** Whether you're downloading a BluRay remux, streaming via .strm files, or watching live TV, it's all in Cinephage.

---

## What It Replaces

Cinephage brings together functionality you'd typically find across multiple applications:

- **Radarr & Sonarr** — Movie and TV series management
- **Prowlarr** — Indexer management with supported trackers
- **Bazarr** — Multi-provider subtitle management
- **Overseerr** — Content discovery and smart lists
- **FlareSolverr** — Built-in Cloudflare bypass (no external service needed)
- **Plus** — Live TV/IPTV management, usenet streaming, and more

The \*arr projects are fantastic at what they do. We just took a different path — one unified codebase instead of separate services that need to sync with each other.

---

## Key Features

### Stream Without Downloading

Create `.strm` files that point to online sources and watch instantly. No disk space, no waiting for downloads, no seeding. Works with Jellyfin, Emby, Kodi, or any player that supports .strm files.

### Built-in Cloudflare Bypass

Camoufox integration handles Cloudflare challenges automatically. No separate FlareSolverr container to maintain, no configuration headaches. It just works.

### Usenet Streaming

Stream directly from NZBs without downloading the entire file first. Unique seekable stream implementation with adaptive prefetching and segment caching.

### Live TV with Portal Discovery

Connect Stalker portals and automatically discover working MAC addresses. Full EPG support, channel management, and HLS streaming.

### Smart Quality Scoring

50+ scoring factors including codec efficiency (x265/AV1), HDR formats, audio quality, and release group reputation. Custom format creation for personalized scoring rules.

### Smart Lists

Dynamic content discovery with auto-add to library. Import from IMDb, Trakt, TMDb lists, or create custom queries. "Automatically add all 2024 movies rated 7.5+" — fully automated.

### Everything Else You'd Expect

- File watching and auto-import
- Multi-indexer search with deduplication
- 6 subtitle providers, 80+ languages
- 7 automated monitoring tasks
- Jellyfin/Emby notifications
- TRaSH Guides-compatible naming

---

## Quick Start

### Docker (Recommended)

Create a `docker-compose.yaml` file:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC
      - ORIGIN=http://localhost:3000
    volumes:
      - ./config:/config
      - /path/to/media:/media # CHANGE THIS
      - /path/to/downloads:/downloads # CHANGE THIS
```

Then start it:

```bash
docker compose up -d
```

**That's it.** Open http://localhost:3000 and follow the setup wizard.

> **Note:** Your data, config, and logs are stored in `./config` (automatically created). Never mount `/app` as it contains application code.
>
> **Upgrading from older versions?** See [Migration Guide](docs/support/troubleshooting.md#migration-from-legacy-appdata-and-applogs-mounts) if you previously used `/app/data` and `/app/logs` mounts.

### Requirements

- **TMDB API Key**: Free at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
- **Download Client** (optional): qBittorrent, SABnzbd, NZBGet, or NZBMount
  - Or use streaming mode — no download client needed
- **Optional**: ffprobe for media info extraction

---

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/INDEX.md) folder:

- **[Getting Started](docs/getting-started/installation.md)** — Installation and first setup
- **[Features](docs/INDEX.md#features)** — Detailed feature guides
- **[Configuration](docs/INDEX.md#configuration)** — Setup all integrations
- **[Operations](docs/INDEX.md#operations)** — Deployment and maintenance
- **[Development](docs/INDEX.md#development)** — Contributing guidelines

---

## Community

- **[Discord](https://discord.gg/scGCBTSWEt)** — Chat and support
- **[GitHub Issues](https://github.com/MoldyTaint/cinephage/issues)** — Bug reports and feature requests
- **[Contributing](CONTRIBUTING.md)** — Development guidelines

---

## Contributors

Thanks to everyone who has contributed to Cinephage!

<a href="https://github.com/MoldyTaint/Cinephage/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=MoldyTaint/Cinephage&max=100&columns=10" alt="Contributors" />
</a>

[View all contributors →](https://github.com/MoldyTaint/Cinephage/graphs/contributors)

---

## Acknowledgments

Cinephage draws inspiration from the excellent [Radarr](https://github.com/Radarr/Radarr), [Sonarr](https://github.com/Sonarr/Sonarr), [Prowlarr](https://github.com/Prowlarr/Prowlarr), and [Bazarr](https://github.com/morpheus65535/bazarr) projects, with UI patterns influenced by [Overseerr](https://github.com/sct/overseerr). Quality scoring data comes from [Dictionarry](https://github.com/Dictionarry-Hub/database). Metadata powered by [TMDB](https://www.themoviedb.org/).

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for complete attribution.

---

## AI Disclosure

This project was built with AI assistance. As a solo developer learning as I go, AI helps bridge the gap between ambition and experience. We believe in being upfront about how this is built.

---

## Legal Notice

Cinephage is a media management tool. It does not host, store, or distribute any media content. All content comes from external sources you configure. Live TV/IPTV functionality depends entirely on third-party services.

---

## License

[GNU General Public License v3.0](LICENSE)
