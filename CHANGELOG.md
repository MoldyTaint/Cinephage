# Changelog

All notable changes to Cinephage will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Captcha Solver** - Built-in Cloudflare/challenge bypass using Camoufox (anti-detect Firefox browser)
  - Automatic challenge detection and solving for protected indexers
  - Cookie caching to minimize solves
  - Settings UI at Settings > Integrations > Captcha Solver
  - Statistics tracking (success rate, solve times)
- **Smart Lists** - Dynamic TMDB Discover-based lists with 50+ filter options, auto-add to library, scheduled refresh, and quality/language profile assignment
- **Movie collection bulk-add** - Add entire TMDB collections to library at once
- **Task execution history** - All monitoring tasks now record per-item activity to the history database
- **30-day history cleanup** - Automatic cleanup of old task history entries on startup
- **Unified task registry** - Centralized task definitions with consistent configuration
- **Embedded subtitle recognition** - Language profiles now count embedded subtitles (in MKV/video containers) as satisfying requirements, preventing unnecessary external subtitle downloads
- **Missing Subtitles monitoring task** - Automatically searches for subtitles on media missing required languages (default: every 6 hours)
- **Subtitle Upgrade monitoring task** - Searches for better-scoring subtitles when profile allows upgrades (default: daily)
- **Subtitle search on import** - Triggers automatic subtitle search when media files are imported
- **OldToons.World indexer** - Private UNIT3D tracker for classic animated content with API key authentication
- **SABnzbd download client** - Full usenet downloader support with queue/history monitoring
- **Newznab protocol** - Generic usenet indexer integration with dynamic capability discovery
- **NZB validation service** - XML structure validation and metadata extraction
- **Unified indexer architecture** - YAML-only design with protocol handlers (torrent/usenet/streaming)
- **Dynamic capability discovery** - Fetches `/api?t=caps` at indexer creation to determine supported search parameters
- **Streaming infrastructure** - Circuit breaker, health monitoring, multi-level caching
- **Stream validation** - HLS playlist and segment verification
- **HLS playlist utilities** - Validation, sanitization, and variant selection for master playlists
- **Provider registry** - Capability-based provider selection with health scoring
- **Auth system** - Pluggable providers (API key, cookie, form, passkey, basic)
- **Subtitle search worker** - Background subtitle discovery for library items
- **Library subtitle preferences** - Per-library language settings

### Changed

- **BREAKING: Docker environment variables renamed to CINEPHAGE\_\* prefix** - All Docker Compose `.env` variables now use the `CINEPHAGE_` prefix for consistency and to avoid conflicts with other services. Update your `.env` file:
  - `MEDIA_PATH` → `CINEPHAGE_MEDIA_PATH`
  - `PUID` → `CINEPHAGE_UID`
  - `PGID` → `CINEPHAGE_GID`
  - `PORT` → `CINEPHAGE_PORT`
  - `ORIGIN` → `CINEPHAGE_ORIGIN`
  - `TZ` → `CINEPHAGE_TZ`
- **Docker base image changed from Alpine to Debian** - Required for Camoufox browser support. Existing users should pull the new image and recreate containers. See [Migration Notes](#migration-notes) below.
- **Unified Tasks page** - Consolidated monitoring settings into Settings > Tasks (removed separate Monitoring page)
- **CutoffUnmet task** - Now specifically targets items below quality cutoff (daily frequency)
- **Upgrade task** - Now searches ALL items for potential upgrades, not just below cutoff (weekly frequency)
- **Subtitle task activity** - MissingSubtitles and SubtitleUpgrade tasks now record detailed per-item history
- RequestBuilder now recognizes `name` and `search` as valid search parameters (for UNIT3D trackers)
- Migrated from native TypeScript indexers to YAML-only definitions
- Rebuilt indexer database schema with definitions table and enhanced status tracking
- Enhanced health tracking with consecutive failure counting and exponential backoff
- Added protocol-specific settings columns for torrent/usenet/streaming
- RequestBuilder filters unsupported search parameters based on live indexer capabilities
- HLS proxy properly marks streams as VOD with `#EXT-X-PLAYLIST-TYPE:VOD` and `#EXT-X-ENDLIST`
- HLS proxy handles obfuscated segment URLs (providers using fake extensions like .txt, .jpg)
- Videasy streaming provider uses parallel extraction across 4 servers simultaneously
- Exclude specials (season 0) from series episode counts
- Added database indexes and TMDB response caching for performance
- Language-aware streaming with parallel extraction optimization

### Removed

- **Browser Solver** - Replaced by new Captcha Solver using Camoufox (more reliable, better anti-detection)
- **BROWSER*SOLVER*\* environment variables** - Captcha Solver is now configured via the UI
- **Monitoring settings page** - Consolidated into unified Tasks page
- **Duplicate task registry** - Removed registry.ts in favor of UnifiedTaskRegistry
- Native TypeScript indexer implementations (replaced by YAML definitions)
- Old indexer registry and base classes
- **Podnapisi subtitle provider** - Server no longer responding
- **Subscene subtitle provider** - Blocked by CloudFlare protection

### Fixed

- **Monitoring history typo** - Fixed `grabbeRelease` → `grabbedRelease` in task history recording
- **Svelte state warnings** - Fixed TaskCard and IntervalEditor components capturing initial prop values
- **Language profile assignment** - Fixed default language profile not being assigned when adding media with subtitles enabled (query pattern issue)
- **Subf2m subtitle provider** - Updated CSS selectors to match current site structure

- HLS streams starting from end instead of beginning (missing VOD markers)
- HLS segment detection for providers using obfuscated URLs with fake extensions

### Migration Notes

#### Docker Image Change (Alpine to Debian)

The Docker image has changed from `node:22-alpine` to `node:22-slim` (Debian). This change was required to support the new Camoufox-based Captcha Solver, which needs Firefox browser dependencies that are not available on Alpine Linux.

**What you need to do:**

1. Pull the new image:

   ```bash
   docker compose pull
   ```

2. Recreate your container:
   ```bash
   docker compose up -d --force-recreate
   ```

**What's different:**

- Image size increased by ~40MB (180MB -> 220MB)
- First startup will download the Camoufox browser (~80MB, stored in data volume)
- The `BROWSER_SOLVER_ENABLED` environment variable is no longer used (remove from your `.env`)
- Captcha Solver is now configured via Settings > Integrations > Captcha Solver

**Your data is safe:** The SQLite database, logs, and configuration are stored in the mounted `/config` volume and will not be affected.

---

## [0.1.0] - 2025-XX-XX

Initial public preview release.

### Added

#### Core Features

- TMDB integration for movie and TV show discovery
- Multi-indexer search with 12+ built-in indexer definitions
- Smart quality scoring with four built-in profiles (Best, Efficient, Compact, Micro)
- qBittorrent integration for automated downloads
- Library management with automatic file organization
- Real-time filesystem watching for library updates

#### Indexer System

- Native Cardigann-compatible YAML indexer engine
- Built-in indexers: YTS, EZTV
- Newznab protocol support for usenet indexers
- Per-host rate limiting
- Automatic health tracking with exponential backoff
- Cloudflare detection

#### Monitoring and Automation

- Missing content search task
- Quality upgrade monitoring
- New episode detection
- Cutoff unmet search
- Pending release cleanup
- Configurable task intervals
- Database persistence of task state

#### Subtitle Management

- Six subtitle providers: OpenSubtitles, Addic7ed, SubDL, YIFY Subtitles, Gestdown, Subf2m
- 150+ language support with regional variants
- Language profile management
- Automatic subtitle search on import
- Provider priority ordering
- Download scoring and ranking

#### Streaming Integration

- .strm file generation for external media players
- Multiple streaming provider support
- AniList integration for anime metadata
- CORS proxy for cross-origin content

#### User Interface

- Modern SvelteKit 5 + Svelte 5 frontend
- TailwindCSS 4 + DaisyUI styling
- Responsive design
- Dark/light theme support
- Real-time download progress tracking

#### Developer Experience

- TypeScript throughout
- Drizzle ORM with SQLite
- ESLint + Prettier code quality
- Vitest testing framework
- Hot reload development server

### Technical Details

- Node.js 20+ required
- SQLite database (no external database needed)
- Environment-based configuration
- Systemd service file included
- Structured logging with rotation

---

## Version History

Future releases will be documented here following the same format.

### Versioning Scheme

- **Major** (X.0.0): Breaking changes, major feature overhauls
- **Minor** (0.X.0): New features, non-breaking enhancements
- **Patch** (0.0.X): Bug fixes, security updates, minor improvements

### Release Cadence

During the preview phase, releases may be frequent as features stabilize. After the 1.0 release, we will follow a more structured release schedule.
