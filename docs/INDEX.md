# Cinephage Documentation

Welcome to Cinephage, a self-hosted media management application that combines the functionality of Radarr, Sonarr, Prowlarr, and Bazarr into a single interface backed by one database.

---

## Quick Start

New to Cinephage? Follow these three steps:

1. **[Installation](getting-started/installation.md)** - Get Cinephage running with Docker or manually
2. **[Setup Wizard](getting-started/setup-wizard.md)** - Configure TMDB, download clients, and root folders
3. **[Adding Media](getting-started/adding-media.md)** - Add your first movie or TV show

---

## Features

Cinephage provides a comprehensive set of features for managing your media library:

### Core Features

| Guide                                                | Description                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| [Library Management](features/library.md)            | File scanning, TMDB matching, media organization              |
| [Search & Download](features/search-and-download.md) | Finding and grabbing releases from indexers                   |
| [Quality Profiles](features/quality-profiles.md)     | 4 built-in profiles, 50+ scoring factors                      |
| [Subtitles](features/subtitles.md)                   | 6 providers, language profiles, auto-download                 |
| [Monitoring](features/monitoring.md)                 | 7 automated tasks for missing content, upgrades, new episodes |
| [Workers](features/workers.md)                       | Background task system with progress tracking                 |
| [Blocklist](features/blocklist.md)                   | Prevent re-downloading failed releases                        |

### Advanced Features

| Guide                                            | Description                                              |
| ------------------------------------------------ | -------------------------------------------------------- |
| [Streaming](features/streaming.md)               | 10 providers, circuit breaker failover, .strm files      |
| [Smart Lists](features/smart-lists.md)           | Dynamic TMDB queries with auto-add to library            |
| [Notifications](features/notifications.md)       | Jellyfin/Emby library update integration                 |
| [Live TV](features/live-tv.md)                   | Stalker portal, EPG, channel management _(experimental)_ |
| [Captcha Solver](features/captcha-solver.md)     | Built-in Cloudflare challenge solving                    |
| [Custom Formats](features/custom-formats.md)     | User-defined quality scoring rules                       |
| [Delay Profiles](features/delay-profiles.md)     | Prevent premature downloads                              |
| [Usenet Streaming](features/usenet-streaming.md) | Stream NZBs without downloading                          |

---

## Configuration

Detailed setup guides for integrations:

| Guide                                                     | Description                                        |
| --------------------------------------------------------- | -------------------------------------------------- |
| [Download Clients](configuration/download-clients.md)     | qBittorrent, SABnzbd, NZBGet, NZBMount setup       |
| [Indexers](configuration/indexers.md)                     | Built-in indexers, Newznab for usenet, custom YAML |
| [Settings Reference](configuration/settings-reference.md) | All configuration options with defaults            |

---

## Operations

Running Cinephage in production:

| Guide                                            | Description                          |
| ------------------------------------------------ | ------------------------------------ |
| [Deployment](operations/deployment.md)           | Docker, systemd, reverse proxy, SSL  |
| [Backup & Restore](operations/backup-restore.md) | Database backup and recovery         |
| [Migration](operations/migration.md)             | Upgrading from older versions        |
| [Updating](operations/updating.md)               | Update procedures and best practices |

---

## Advanced

Power-user documentation:

| Guide                                                      | Description                      |
| ---------------------------------------------------------- | -------------------------------- |
| [Environment Variables](advanced/environment-variables.md) | Complete configuration reference |
| [Database Schema](advanced/database-schema.md)             | SQLite schema reference          |
| [Performance Tuning](advanced/performance-tuning.md)       | Optimize for your hardware       |
| [API Reference](advanced/api-reference.md)                 | REST API documentation           |

---

## Support

Need help?

| Resource                                      | Description                  |
| --------------------------------------------- | ---------------------------- |
| [Troubleshooting](support/troubleshooting.md) | Common issues and solutions  |
| [FAQ](support/faq.md)                         | Frequently asked questions   |
| [Getting Help](support/getting-help.md)       | Discord, GitHub, bug reports |

---

## Project

| Resource                                 | Description                            |
| ---------------------------------------- | -------------------------------------- |
| [Roadmap](roadmap.md)                    | Planned features and known limitations |
| [Changelog](../CHANGELOG.md)             | Version history                        |
| [Security Policy](../SECURITY.md)        | Vulnerability reporting                |
| [Code of Conduct](../CODE_OF_CONDUCT.md) | Community standards                    |

---

## Development

For contributors:

| Document                                                    | Description                              |
| ----------------------------------------------------------- | ---------------------------------------- |
| [Architecture](development/architecture.md)                 | System overview, patterns, diagrams      |
| [Contributing](development/contributing.md)                 | Development setup, workflow, conventions |
| [Monitoring Internals](development/monitoring-internals.md) | Specification pattern, task logic        |
| [Testing](development/testing.md)                           | Test plan and guidelines                 |
