[< Back to Index](INDEX.md)

# Roadmap

This document outlines planned features, work in progress, and known limitations for Cinephage. It's intended to give users and contributors visibility into the project's direction.

For completed features and changes, see the [Changelog](../CHANGELOG.md).

---

## Status Legend

| Status              | Meaning                                        |
|---------------------|------------------------------------------------|
| In Progress         | Actively being worked on                       |
| Planned             | Confirmed for future development               |
| Not Yet Started     | On the horizon but not actively in development |
| Under Consideration | Being evaluated, not yet committed             |
| Known Limitation    | Acknowledged gap or incomplete feature         |

## Priority Legend

| Priority | Meaning                                     |
|----------|---------------------------------------------|
| High     | Core functionality, significant user impact |
| Medium   | Important enhancement, moderate impact      |
| Low      | Nice to have, minor improvement             |

---

## Current Focus

Features actively being developed.

### Streaming Provider Settings Integration

In Progress | High | **Area**: Streaming

Complete the integration of streaming providers with the settings system.

**Context**: The streaming provider infrastructure exists but isn't fully connected to the user-facing settings UI. This will allow users to enable/disable and configure streaming providers directly from the interface.

---

## Up Next

Features confirmed for upcoming releases.

### Usenet Client Support

Planned | High | **Area**: Download Clients

Add support for Usenet download clients: SABnzbd and NZBGet.

**Context**: Currently Cinephage only supports torrent downloads via qBittorrent. Adding Usenet support opens up a major alternative download method and enables the use of Usenet indexers (NZBGeek, DrunkenSlug, etc.).

**Dependencies**: Must be implemented before Usenet indexers can be used.

---

### Tag-Based Monitoring Profiles

Planned | Medium | **Area**: Monitoring

Implement tag matching for content-specific delay and upgrade profiles.

**Context**: Currently, delay profiles apply globally. This feature would allow different delay/upgrade rules based on content tags (e.g., longer delays for anime, immediate grabs for documentaries).

---

### Additional Public Indexers

Planned | Medium | **Area**: Indexers

Continue expanding built-in indexer support:

- The Pirate Bay
- EZTVx (EZTV mirror)
- ShowRSS
- Tokyo Toshokan
- AnimeTosho

**Context**: More indexer coverage means better search results and content availability. Priority targets include anime indexers (SubsPlease, Anidex, Nyaa).

---

### Notifications System

Planned | Medium | **Area**: Infrastructure

Implement notification support for various events:

- Download started/completed
- Import successful/failed
- Health check failures
- New content available

**Notification channels**:

- Discord webhooks
- Email (SMTP)
- Generic webhooks
- Pushover, Telegram, etc.

**Context**: Users want to be notified of important events without constantly checking the UI.

---

### Import Lists

Planned | Medium | **Area**: Library

Sync watchlists from external services:

- Trakt
- IMDb watchlists
- Letterboxd
- Plex watchlists

**Context**: Allows users to manage their "want to watch" list externally and have Cinephage automatically monitor those titles.

---

### Calendar View

Planned | Medium | **Area**: UI/UX

Visual calendar showing upcoming releases for monitored content.

**Context**: Provides at-a-glance visibility into when new episodes or movies are releasing. Similar to Sonarr/Radarr calendar functionality.

---

## Future Plans

Longer-term features under consideration.

### Multi-User Support

Under Consideration | Medium | **Area**: Infrastructure

Add user authentication and multi-user support:

- User accounts with login
- Role-based permissions
- Per-user settings and preferences
- Activity logging per user

**Context**: Currently Cinephage is single-user. This would enable shared instances for families or groups.

**Workaround**: Use reverse proxy authentication (e.g., Authelia, Authentik).

---

### Additional Download Clients

Under Consideration | Medium | **Area**: Download Clients

Support for additional torrent clients:

- Transmission
- Deluge
- rTorrent
- qBittorrent v5 API changes

**Context**: Users have different preferences for download clients. Supporting more clients increases flexibility.

---

### Docker Official Image

Under Consideration | Medium | **Area**: Infrastructure

Create and publish an official Docker image.

**Context**: Simplifies deployment for users who prefer containerized applications. Would include proper health checks, volume mounts, and environment variable configuration.

---

## Not Yet Started

Features on the horizon but not actively in development.

### Live TV / IPTV Support

Not Yet Started | Medium | **Area**: Streaming

Support for live TV streams and IPTV sources.

**Context**: Would enable users to integrate live television alongside their on-demand library. Requires significant infrastructure work for stream handling.

---

### Improved Cloudflare Handling

Not Yet Started | Medium | **Area**: Infrastructure

Better handling of Cloudflare-protected indexers.

**Context**: Many popular indexers use Cloudflare protection. Better integration with FlareSolverr or similar solutions would improve reliability. Currently, some protected sites may fail or require workarounds via Prowlarr.

---

### Music Support (Lidarr-style)

Not Yet Started | Low | **Area**: Library

Artist/album discovery, music indexers, audio quality profiles.

**Context**: Would extend Cinephage beyond video content. Requires integration with MusicBrainz for metadata and music-specific indexers.

---

### Books Support (Readarr-style)

Not Yet Started | Low | **Area**: Library

Book and ebook management with Library Genesis integration.

**Context**: Further extends the "all-in-one" vision to include written media. Would require book-specific metadata sources and indexers.

---

### Audiobooks Support

Not Yet Started | Low | **Area**: Library

Audiobook library management and metadata.

**Context**: Related to Books Support but with unique requirements for audio file handling and audiobook-specific metadata.

---

### Enhanced Streaming Provider Support

Not Yet Started | Medium | **Area**: Streaming

Deeper integration with streaming services for availability tracking.

**Context**: Currently shows watch providers from TMDB. Enhanced support could include real-time availability checking and cross-platform search.

---

### Additional Subtitle Providers

Not Yet Started | Low | **Area**: Subtitles

Expand subtitle provider support beyond the current 6 providers.

**Context**: More providers means better coverage for obscure content and languages.

---

## Known Limitations

Current acknowledged gaps and their workarounds.

### Torrent-Only Downloads

Known Limitation | High

Cinephage currently only supports torrent downloads. Usenet is not yet supported.

**Workaround**: None currently. Usenet support is high priority on the roadmap.

---

### Single User Only

Known Limitation | Medium

No built-in user authentication or multi-user support.

**Workaround**: Place Cinephage behind an authenticating reverse proxy like Authelia, Authentik, or Nginx basic auth.

---

### qBittorrent Only

Known Limitation | Medium

qBittorrent is the only supported download client.

**Workaround**: None. Users must use qBittorrent or wait for additional client support.

---

## Contributing

Have a feature request or found something missing?

1. **Check existing issues**: Your idea may already be tracked on [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues)
2. **Open a new issue**: Use the feature request template to describe your idea
3. **Contribute code**: See the [Contributing Guide](development/contributing.md) for development guidelines

We welcome community input on prioritization and new feature ideas!

---

**See also:** [Changelog](../CHANGELOG.md) | [Contributing](development/contributing.md)
