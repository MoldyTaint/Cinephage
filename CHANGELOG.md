# Changelog

All notable changes to Cinephage will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.2.0] - 2026-04-17

### Added

- Unified Status page combining storage health, disk usage, scan progress, and media server playback stats into a single dashboard at Settings > Status
- MediaServerStatsSection component with total plays, unique items tracked, resolution/codec/HDR/audio/container breakdowns, top played items, and largest items tables
- Media Explorer filter bar redesign with tiered layout - primary filter chips (Type, Status, Plays, Library) always visible, quality/technical filters (Resolution, Codec, HDR, Audio, Container, Class, Folder) collapsed behind expandable toggle with active-filter count badge
- Playback column in Media Explorer showing isPlayed checkmark indicator, play count, watched percentage progress bar (synced from Jellyfin/Emby/Plex), and relative last-played date in both desktop table and mobile card views
- Server sync status badges with per-server last sync indicators on the Status page

### Changed

- Codec, audio, and container format labels now display uppercase consistently across all stats breakdowns
- HDR format labels now display uppercase in stats breakdowns

### Removed

- Separate Storage Maintenance and Media Server Stats pages in favor of unified Status page

---

## [0.1.0] - 2026-04-15

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
- Unified indexer architecture - YAML-only design with protocol handlers (torrent/usenet/streaming)
- Dynamic capability discovery - Fetches `/api?t=caps` at indexer creation to determine supported search parameters
- OldToons.World indexer - Private UNIT3D tracker for classic animated content with API key authentication

#### Monitoring and Automation

- Missing content search task
- Quality upgrade monitoring
- New episode detection
- Cutoff unmet search
- Pending release cleanup
- Configurable task intervals
- Database persistence of task state
- Task execution history - All monitoring tasks now record per-item activity to the history database
- 30-day history cleanup - Automatic cleanup of old task history entries on startup
- Unified task registry - Centralized task definitions with consistent configuration

#### Download Clients

- SABnzbd download client - Full usenet downloader support with queue/history monitoring
- SABnzbd Mount Mode - WebDAV-mounted NZB streaming with STRM/Symlink import support
- rTorrent (XML-RPC) download client
- Transmission (RPC API) download client
- NZBGet download client
- Download client URL base support - Optional URL base configuration for reverse proxy setups
- Clear failed downloads - Bulk remove failed items from download queue with confirmation modal
- Pause/resume support in activity and download queue

#### Subtitle Management

- Six subtitle providers: OpenSubtitles, Addic7ed, SubDL, YIFY Subtitles, Gestdown, Subf2m
- 150+ language support with regional variants
- Language profile management
- Automatic subtitle search on import
- Provider priority ordering
- Download scoring and ranking
- Embedded subtitle recognition - Language profiles now count embedded subtitles (in MKV/video containers) as satisfying requirements, preventing unnecessary external subtitle downloads
- Missing Subtitles monitoring task - Automatically searches for subtitles on media missing required languages (default: every 6 hours)
- Subtitle Upgrade monitoring task - Searches for better-scoring subtitles when profile allows upgrades (default: daily)
- Subtitle search on import - Triggers automatic subtitle search when media files are imported
- Subtitle search worker - Background subtitle discovery for library items
- Library subtitle preferences - Per-library language settings
- NZB validation service - XML structure validation and metadata extraction

#### Streaming Integration

- .strm file generation for external media players
- Multiple streaming provider support
- AniList integration for anime metadata
- CORS proxy for cross-origin content
- Streaming infrastructure - Circuit breaker, health monitoring, multi-level caching
- Stream validation - HLS playlist and segment verification
- HLS playlist utilities - Validation, sanitization, and variant selection for master playlists
- Provider registry - Capability-based provider selection with health scoring

#### Smart Lists

- Dynamic TMDB Discover-based lists with 50+ filter options
- Auto-add to library on match
- Scheduled refresh
- Quality and language profile assignment

#### Live TV

- EPG sync with M3U parsing
- XStream URL normalization and player API
- Channel management

#### Integrations

- Plex media server support for library notifications
- Captcha Solver - Built-in Cloudflare/challenge bypass using Camoufox (anti-detect Firefox browser)
  - Automatic challenge detection and solving for protected indexers
  - Cookie caching to minimize solves
  - Settings UI at Settings > Integrations > Captcha Solver
  - Statistics tracking (success rate, solve times)
- Auth system - Pluggable providers (API key, cookie, form, passkey, basic)
- Configuration backup and restore with encrypted secrets

#### Library Management

- Movie collection bulk-add - Add entire TMDB collections to library at once
- Import wizard with API and error handling refactor
- Anime root folder subtypes, enforcement, and queued media moves
- Custom library management and storage maintenance improvements
- Availability tracking for movies

#### User Interface

- Modern SvelteKit 5 + Svelte 5 frontend
- TailwindCSS 4 + DaisyUI styling
- Responsive design with dark/light theme support
- Real-time download progress tracking
- Mobile UI responsiveness - Activity table mobile card view, live TV channel search in modal, improved responsive layouts across all pages
- Unified Tasks page - Consolidated monitoring settings into Settings > Tasks
- Standardized library/discover routes - Library at `/library/movies` and `/library/tv`, discover at `/discover/movie/:id` and `/discover/tv/:id`
- Settings split into horizontal nav layouts with child routes

#### Developer Experience

- TypeScript throughout
- Drizzle ORM with SQLite
- ESLint + Prettier code quality
- Vitest testing framework
- Hot reload development server
- NixOS package and module support

### Changed

- Docker base image changed from Alpine to Debian - Required for Camoufox browser support. See [Migration Notes](#migration-notes) below.
- CutoffUnmet task now specifically targets items below quality cutoff (daily frequency)
- Upgrade task now searches ALL items for potential upgrades, not just below cutoff (weekly frequency)
- Subtitle search on import automatically triggers when movies/episodes are imported to library
- Library deletion UX - Immediate status updates on file/media deletion without page refresh
- Series monitoring locked state - Disabled season/episode monitoring toggles when parent series is unmonitored
- Subtitle task activity - MissingSubtitles and SubtitleUpgrade tasks now record detailed per-item history
- Migrated from native TypeScript indexers to YAML-only definitions
- Rebuilt indexer database schema with definitions table and enhanced status tracking
- Enhanced health tracking with consecutive failure counting and exponential backoff
- HLS proxy properly marks streams as VOD with `#EXT-X-PLAYLIST-TYPE:VOD` and `#EXT-X-ENDLIST`
- HLS proxy handles obfuscated segment URLs (providers using fake extensions like .txt, .jpg)
- Exclude specials (season 0) from series episode counts
- Added database indexes and TMDB response caching for performance

### Removed

- Browser Solver - Replaced by Captcha Solver using Camoufox
- `BROWSER_SOLVER_*` environment variables - Captcha Solver is now configured via the UI
- Monitoring settings page - Consolidated into unified Tasks page
- Duplicate task registry - Removed in favor of UnifiedTaskRegistry
- Native TypeScript indexer implementations - Replaced by YAML definitions
- Old indexer registry and base classes
- Podnapisi subtitle provider - Server no longer responding
- Subscene subtitle provider - Blocked by CloudFlare protection

### Fixed

- Monitoring history typo - Fixed `grabbeRelease` to `grabbedRelease` in task history recording
- Svelte state warnings - Fixed TaskCard and IntervalEditor components capturing initial prop values
- Language profile assignment - Fixed default language profile not being assigned when adding media with subtitles enabled
- Subf2m subtitle provider - Updated CSS selectors to match current site structure
- Docker entrypoint syntax - Fixed shell script syntax error in docker-entrypoint.sh
- Docker USER directive - Removed conflicting USER directive for proper entrypoint privilege dropping
- Activity table links - Fixed paths from `/movies/{id}` to `/library/movie/{id}` and `/tv/{id}` to `/library/tv/{id}`
- Queue client filter - Fixed queue and history client filtering behavior on mobile
- Series monitor icon - Fixed series header icon to update instantly on monitor toggle without page refresh
- NPM memory leak prevention - Added `.npmrc` settings and Docker memory limits to prevent build failures
- HLS streams starting from end instead of beginning (missing VOD markers)
- HLS segment detection for providers using obfuscated URLs with fake extensions
- Library scan excluding legitimate titles and preserving streaming file paths
- Tracker search resilience and source format metadata
- Native tracker search titles and alternate-title usage across search flows
- Legacy library backfill from reassigning root folders

### Migration Notes

#### Volume Mount Change (/app/data to /config)

**BREAKING CHANGE:** Docker volume mounts have been consolidated to a single `/config` directory to avoid mounting `/app` and reduce the risk of overwriting application files.

**What changed:**

- Old: `./data:/app/data`
- New: `./config:/config` (single mount for app data, cache, and indexer definitions)

**Automatic migration:**

If you previously used `/app/data` mounts, the entrypoint script will automatically migrate your data when you add the `/config` mount alongside the old mount:

1. Update your `docker-compose.yaml` to add `/config` mount (keep old mounts temporarily):

   ```yaml
   volumes:
      - ./config:/config # NEW: Add this
      - ./data:/app/data # Keep temporarily
       - /path/to/media:/media # REQUIRED: Your media library
       - /path/to/downloads:/downloads # REQUIRED: Download client output folder
   ```

2. Start container - migration happens automatically:

   ```bash
   docker compose up -d
   docker compose logs cinephage | grep -i migrat
   ```

3. After successful migration, remove old mounts:
   ```yaml
   volumes:
     - ./config:/config # Keep only this
     - /path/to/media:/media # REQUIRED: Your media library
     - /path/to/downloads:/downloads # REQUIRED: Download client output folder
   ```

**If migration fails due to permissions:** Run container once as root with `user: 0:0` and set `PUID`/`PGID` environment variables. See [Troubleshooting Guide](docs/support/troubleshooting.md#migration-from-legacy-appdata-and-applogs-mounts).

**Your data is safe:** The migration copies (not moves) your data, so your original files remain untouched until you remove the old mounts.

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

## Version History

Future releases will be documented here following the same format.

### Versioning Scheme

- **Major** (X.0.0): Breaking changes, major feature overhauls
- **Minor** (0.X.0): New features, non-breaking enhancements
- **Patch** (0.0.X): Bug fixes, security updates, minor improvements

### Release Cadence

During the preview phase, releases may be frequent as features stabilize. After the 1.0 release, we will follow a more structured release schedule.
