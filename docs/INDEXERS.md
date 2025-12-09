# Indexers

Cinephage includes built-in support for 23+ torrent indexers using both Cardigann-compatible YAML definitions and native TypeScript implementations. No external tools like Jackett or Prowlarr are required for basic functionality.

This document serves as both usage documentation and a comprehensive catalog of indexers in the torrent ecosystem.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| Supported | Built-in definition, tested and working |
| In Progress | Definition exists, needs testing or fixes |
| Planned | On the roadmap for future support |
| Torznab Only | Use via Prowlarr/Jackett Torznab integration |
| Unstable | Site has reliability issues or frequent downtime |
| Offline | Site is permanently offline |

---

## Public Indexers

### General / Multi-Category

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| 1337x | Movies, TV, Games, Software | Supported | Top-tier, reliable |
| The Pirate Bay | All content types | Planned | Historic, intermittent blocks |
| TorrentGalaxy | Movies, TV, Games | Supported | Good for new releases |
| LimeTorrents | Movies, TV, General | Supported | Decent coverage |
| MagnetDL | Software, General | Supported | Magnet-focused |
| RARBG | General | Offline | Shut down May 2023 |
| TheRARBG | General | Supported | Community mirror/successor |
| Kickass Torrents | General | Offline | Original shut down 2016 |
| Torrentz2 | Meta-search | Offline | Shut down 2022 |
| isoHunt | General | Offline | Shut down 2013 |

### Movies

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| YTS / YIFY | Movies (720p/1080p/2160p) | Supported | Compressed encodes, huge library |
| YifyTorrents | Movies | Planned | YTS alternative |
| PublicHD | HD Movies | Planned | Quality-focused |

### TV Shows

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| EZTV | TV Shows | Supported | Large TV library, fast releases |
| EZTVx | TV Shows | Planned | EZTV mirror |
| TVTorrents | TV Shows | Planned | TV-focused |
| ShowRSS | TV Shows | Planned | RSS-based TV tracking |

### Anime

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| Nyaa.si | Anime, Manga, LNs | Supported | Primary anime source |
| SubsPlease | Anime simulcasts | Supported | Fast simulcast releases |
| Anidex | Multi-language anime | Supported | Good for non-English |
| Tokyo Toshokan | Anime, Japanese media | Planned | Japanese content |
| AnimeTosho | Anime | Planned | NZB + torrents |
| AniRena | Anime | Planned | Anime community |
| Shana Project | Anime | Planned | Anime tracker |
| Minglong | Anime | Planned | Chinese anime focus |
| U2 | Anime, Asian content | Torznab Only | Private, high quality |

### XXX / Adult

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| Pornolab | Adult | Planned | Russian, large library |
| PornBay | Adult | Planned | General adult content |
| Empornium | Adult | Torznab Only | Private tracker |

### Music

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| RuTracker | Music, Movies, Software | Planned | Russian, excellent music |
| Metal Tracker | Metal music | Planned | Genre-specific |

### Software / Games

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| FitGirl Repacks | Games | Planned | Compressed game repacks |
| DODI Repacks | Games | Planned | Game repacks |
| GOG Games | DRM-free games | Planned | GOG releases |

### Books / Educational

| Indexer | Content | Status | Notes |
|---------|---------|--------|-------|
| Library Genesis | Books, Academic | Planned | Massive book archive |
| Z-Library | Books | Planned | Shadow library |
| MAM (MyAnonaMouse) | Books, Audiobooks | Torznab Only | Private, excellent |
| AudioBook Bay | Audiobooks | Planned | Audiobook focused |

---

## Aggregators & Meta-Search

DHT search engines and multi-tracker aggregators.

| Indexer | Type | Status | Notes |
|---------|------|--------|-------|
| BTDig | DHT search | Supported | Indexes DHT network directly |
| BitSearch | Aggregator | Supported | Multi-site search |
| Solidtorrents | DHT aggregator | Supported | Clean interface |
| Knaben | Aggregator | Supported | Indexes 30+ sites |
| TorrentsCSV | DHT database | Supported | Open database |
| Torrent Paradise | DHT search | Planned | Decentralized |
| BT4G | Meta-search | Planned | 91M+ results |
| iDope | Aggregator | Planned | Clean, ad-free |
| Zooqle | Aggregator | Unstable | Intermittent availability |
| TorrentDownloads | Aggregator | Planned | Long-running |
| Snowfl | Meta-search | Planned | Real-time search |

---

## Private Trackers

Private trackers require invitation or application. Use Torznab integration for trackers not natively supported.

### General

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| IPTorrents | General | Supported | ~700k torrents, largest general |
| TorrentLeech | General, 0DAY | Planned | Fast pre-times |
| TorrentDay | General | Supported | Good variety |
| FileList | General | Planned | Romanian, excellent |
| AlphaRatio | General | Planned | Scene releases |
| DigitalCore | General | Planned | |
| Aither | General | Supported | Unit3D-based |
| SpeedCD | General | Supported | |
| SceneTime | Scene releases | Supported | |

### Movies

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| PassThePopcorn (PTP) | Movies | Torznab Only | Elite, closed registration |
| BeyondHD | HD/UHD Movies | Supported | Remuxes, quality encodes |
| HDBits | Elite HD | Torznab Only | Top-tier, very exclusive |
| Blutopia | Movies, TV | Planned | Unit3D-based |
| PrivateHD | HD content | Planned | |
| Cinematik | HD Films | Planned | |
| KaragargA | Rare/Art films | Torznab Only | Very exclusive |
| Secret Cinema | Rare films | Torznab Only | Exclusive |
| CG Persia | CGI, 3D content | Planned | Niche |

### TV

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| BroadcasTheNet (BTN) | TV Shows | Torznab Only | Elite TV tracker |
| MoreThanTV (MTV) | TV Shows | Torznab Only | Quality TV |
| TVVault | Classic/Rare TV | Torznab Only | Archive focus |
| TheShow | TV Shows | Planned | |
| NebulanceTV | TV Shows | Planned | |

### Anime

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| AnimeBytes (AB) | Anime | Torznab Only | Top anime tracker |
| AnimeTorrents | Anime | Planned | |
| BakaBT | Anime (complete series) | Planned | Quality-focused |
| U2 | Anime, Asian | Torznab Only | Chinese-based |

### Music

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| RED (Redacted) | Music (FLAC) | Torznab Only | Top music tracker |
| Orpheus | Music (FLAC) | Torznab Only | RED alternative |
| Libble | Music | Planned | |
| DICMusic | Music | Planned | |

### Games

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| GazelleGames (GGn) | Games | Torznab Only | Top games tracker |
| PixelCove | Retro games | Planned | |

### Specialized

| Tracker | Content | Status | Notes |
|---------|---------|--------|-------|
| OldToonsWorld | Classic cartoons | Supported | Nostalgic content |
| HD-Space | HD content | Planned | |
| HDTorrents | HD content | Planned | |
| Anthelion | eBooks, audiobooks | Planned | |
| BitHDTV | HD content | Planned | |
| TorrentSeeds | General | Planned | |
| DanishBytes | Danish content | Planned | Regional |
| NorBits | Norwegian content | Planned | Regional |
| HDBits.ro | Romanian HD | Planned | Regional |

---

## Usenet Indexers (NZB)

Usenet support is planned for future releases.

| Indexer | Type | Status | Notes |
|---------|------|--------|-------|
| NZBGeek | Paid | Planned | Excellent Sonarr/Radarr integration |
| DrunkenSlug | Paid | Planned | nZEDb-based |
| NZB Finder | Paid | Planned | Established 2012 |
| DOGnzb | Paid | Planned | Fast, curated |
| NZBPlanet | Paid | Planned | 2M+ NZBs |
| Binsearch | Free | Planned | 1100 days retention |
| NZBKing | Free/Paid | Planned | Good free tier |

---

## Using Indexers

### Enabling Built-in Indexers

1. Navigate to **Settings > Integrations > Indexers**
2. Browse available indexers
3. Toggle indexers on/off
4. Configure settings (API keys, credentials for private trackers)
5. Test each indexer to verify connectivity

### Torznab Integration

Connect to Prowlarr or Jackett for indexers without native support:

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer** → **Torznab**
3. Enter connection details:
   - **Name**: Display name
   - **URL**: Prowlarr/Jackett URL
   - **API Key**: From your indexer manager
4. Test and save

**Example URLs:**
- Prowlarr: `http://localhost:9696/1/api`
- Jackett: `http://localhost:9117/api/v2.0/indexers/INDEXER_NAME/results/torznab`

---

## Custom Indexers

Create definitions using Cardigann-compatible YAML.

### Creating a Definition

1. Create a YAML file in `data/indexers/definitions/`
2. Follow the Cardigann format
3. Restart Cinephage to load

### Example Definition

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

### Definition Structure

| Section | Purpose |
|---------|---------|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Brief description |
| `language` | Primary language code |
| `type` | `public` or `private` |
| `caps` | Supported categories and search modes |
| `search` | Search request configuration |
| `download` | Download link extraction |
| `login` | Authentication (private trackers) |

See existing definitions in `data/indexers/definitions/` for complete examples.

---

## Indexer Settings

### Rate Limiting

Each indexer has configurable rate limits:

- **Requests per minute**: Maximum API calls per minute
- **Cooldown**: Time to wait after rate limit hit

### Auto-Disable

Indexers that repeatedly fail are automatically disabled with exponential backoff:

| Failure | Cooldown |
|---------|----------|
| 1st | 5 minutes |
| 2nd | 15 minutes |
| 3rd | 1 hour |
| 4th+ | Up to 24 hours |

Re-enable manually in Settings after resolving issues.

### Health Monitoring

Monitor indexer health in **Settings > Integrations > Indexers**:

- **Status**: Enabled, disabled, rate-limited
- **Last Success**: Time of last successful search
- **Failure Count**: Consecutive failures
- **Response Time**: Average latency

---

## Contributing Indexers

Want to add support for an indexer? See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on:

- Writing Cardigann YAML definitions
- Testing indexer definitions
- Submitting pull requests

The Prowlarr project maintains an extensive collection of indexer definitions that can serve as reference: [Prowlarr/Indexers](https://github.com/Prowlarr/Indexers)
