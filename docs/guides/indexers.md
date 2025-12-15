[< Back to Index](../INDEX.md) | [Quality Profiles](quality-profiles.md) | [Subtitles](subtitles.md)

# Indexers

Cinephage uses a YAML-based indexer engine with Cardigann-compatible definitions. Currently, four public indexers (BitSearch, EZTV, Knaben, YTS) and two private trackers (OldToons.World, SceneTime) are fully supported, with more being added. For indexers not yet built in, use Torznab or Newznab integration with [Prowlarr](https://prowlarr.com/) or [Jackett](https://github.com/Jackett/Jackett).

> **Note**: The indexer system was recently overhauled to a unified YAML-only architecture. Many previously supported native indexers are being converted to YAML definitions.

---

## Status Legend

| Status             | Meaning                                          |
|--------------------|--------------------------------------------------|
| Supported          | Built-in definition, tested and working          |
| In Progress        | Converting to new YAML format                    |
| Planned            | On the roadmap for future support                |
| Torznab/Newznab    | Use via Prowlarr/Jackett integration             |
| Cloudflare Blocked | Requires FlareSolverr or similar                 |
| Unstable           | Site has reliability issues or frequent downtime |
| Offline            | Site is permanently offline                      |

---

## Public Indexers

### General / Multi-Category

| Indexer          | Content                     | Status      | Notes                                  |
|------------------|-----------------------------|-------------|----------------------------------------|
| 1337x            | Movies, TV, Games, Software | Planned     | Cloudflare protected, use FlareSolverr |
| The Pirate Bay   | All content types           | Planned     | Historic, intermittent blocks          |
| TorrentGalaxy    | Movies, TV, Games           | In Progress | Converting to YAML                     |
| LimeTorrents     | Movies, TV, General         | In Progress | Converting to YAML                     |
| MagnetDL         | Software, General           | In Progress | Converting to YAML                     |
| RARBG            | General                     | Offline     | Shut down May 2023                     |
| TheRARBG         | General                     | In Progress | Converting to YAML                     |
| Kickass Torrents | General                     | Offline     | Original shut down 2016                |
| Torrentz2        | Meta-search                 | Offline     | Shut down 2022                         |
| isoHunt          | General                     | Offline     | Shut down 2013                         |

### Movies

| Indexer      | Content                   | Status        | Notes                            |
|--------------|---------------------------|---------------|----------------------------------|
| YTS / YIFY   | Movies (720p/1080p/2160p) | **Supported** | Compressed encodes, huge library |
| YifyTorrents | Movies                    | Planned       | YTS alternative                  |
| PublicHD     | HD Movies                 | Planned       | Quality-focused                  |

### TV Shows

| Indexer    | Content  | Status        | Notes                           |
|------------|----------|---------------|---------------------------------|
| EZTV       | TV Shows | **Supported** | Large TV library, fast releases |
| EZTVx      | TV Shows | Planned       | EZTV mirror                     |
| TVTorrents | TV Shows | Planned       | TV-focused                      |
| ShowRSS    | TV Shows | Planned       | RSS-based TV tracking           |

### Anime

| Indexer        | Content               | Status          | Notes                 |
|----------------|-----------------------|-----------------|-----------------------|
| Nyaa.si        | Anime, Manga, LNs     | In Progress     | Converting to YAML    |
| SubsPlease     | Anime simulcasts      | In Progress     | Converting to YAML    |
| Anidex         | Multi-language anime  | In Progress     | Converting to YAML    |
| Tokyo Toshokan | Anime, Japanese media | Planned         | Japanese content      |
| AnimeTosho     | Anime                 | Planned         | NZB + torrents        |
| AniRena        | Anime                 | Planned         | Anime community       |
| Shana Project  | Anime                 | Planned         | Anime tracker         |
| Minglong       | Anime                 | Planned         | Chinese anime focus   |
| U2             | Anime, Asian content  | Torznab/Newznab | Private, high quality |

### XXX / Adult

| Indexer   | Content | Status          | Notes                  |
|-----------|---------|-----------------|------------------------|
| Pornolab  | Adult   | Planned         | Russian, large library |
| PornBay   | Adult   | Planned         | General adult content  |
| Empornium | Adult   | Torznab/Newznab | Private tracker        |

### Music

| Indexer       | Content                 | Status  | Notes                    |
|---------------|-------------------------|---------|--------------------------|
| RuTracker     | Music, Movies, Software | Planned | Russian, excellent music |
| Metal Tracker | Metal music             | Planned | Genre-specific           |

### Software / Games

| Indexer         | Content        | Status  | Notes                   |
|-----------------|----------------|---------|-------------------------|
| FitGirl Repacks | Games          | Planned | Compressed game repacks |
| DODI Repacks    | Games          | Planned | Game repacks            |
| GOG Games       | DRM-free games | Planned | GOG releases            |

### Books / Educational

| Indexer            | Content           | Status          | Notes                |
|--------------------|-------------------|-----------------|----------------------|
| Library Genesis    | Books, Academic   | Planned         | Massive book archive |
| Z-Library          | Books             | Planned         | Shadow library       |
| MAM (MyAnonaMouse) | Books, Audiobooks | Torznab/Newznab | Private, excellent   |
| AudioBook Bay      | Audiobooks        | Planned         | Audiobook focused    |

---

## Aggregators & Meta-Search

DHT search engines and multi-tracker aggregators.

| Indexer          | Type         | Status        | Notes                     |
|------------------|--------------|---------------|---------------------------|
| BTDig            | DHT search   | In Progress   | Converting to YAML        |
| BitSearch        | DHT search   | **Supported** | Formerly SolidTorrents    |
| Knaben           | Aggregator   | **Supported** | Multi-tracker aggregator  |
| TorrentsCSV      | DHT database | In Progress   | Converting to YAML        |
| Torrent Paradise | DHT search   | Planned       | Decentralized             |
| BT4G             | Meta-search  | Planned       | 91M+ results              |
| iDope            | Aggregator   | Planned       | Clean, ad-free            |
| Zooqle           | Aggregator   | Unstable      | Intermittent availability |
| TorrentDownloads | Aggregator   | Planned       | Long-running              |
| Snowfl           | Meta-search  | Planned       | Real-time search          |

---

## Private Trackers

Private trackers require invitation or application. Use Torznab/Newznab integration for trackers not natively supported.

### General

| Tracker      | Content        | Status        | Notes                                     |
|--------------|----------------|---------------|-------------------------------------------|
| IPTorrents   | General        | In Progress   | Converting to YAML                        |
| TorrentLeech | General, 0DAY  | Planned       | Fast pre-times                            |
| TorrentDay   | General        | In Progress   | Converting to YAML                        |
| FileList     | General        | Planned       | Romanian, excellent                       |
| AlphaRatio   | General        | Planned       | Scene releases                            |
| DigitalCore  | General        | Planned       |                                           |
| Aither       | General        | In Progress   | Unit3D-based                              |
| SpeedCD      | General        | In Progress   | Converting to YAML                        |
| SceneTime    | Scene releases | **Supported** | Cookie auth, BrowserSolver for Cloudflare |

### Movies

| Tracker              | Content         | Status          | Notes                      |
|----------------------|-----------------|-----------------|----------------------------|
| PassThePopcorn (PTP) | Movies          | Torznab/Newznab | Elite, closed registration |
| BeyondHD             | HD/UHD Movies   | In Progress     | Converting to YAML         |
| HDBits               | Elite HD        | Torznab/Newznab | Top-tier, very exclusive   |
| Blutopia             | Movies, TV      | Planned         | Unit3D-based               |
| PrivateHD            | HD content      | Planned         |                            |
| Cinematik            | HD Films        | Planned         |                            |
| KaragargA            | Rare/Art films  | Torznab/Newznab | Very exclusive             |
| Secret Cinema        | Rare films      | Torznab/Newznab | Exclusive                  |
| CG Persia            | CGI, 3D content | Planned         | Niche                      |

### TV

| Tracker              | Content         | Status          | Notes            |
|----------------------|-----------------|-----------------|------------------|
| BroadcasTheNet (BTN) | TV Shows        | Torznab/Newznab | Elite TV tracker |
| MoreThanTV (MTV)     | TV Shows        | Torznab/Newznab | Quality TV       |
| TVVault              | Classic/Rare TV | Torznab/Newznab | Archive focus    |
| TheShow              | TV Shows        | Planned         |                  |
| NebulanceTV          | TV Shows        | Planned         |                  |

### Anime

| Tracker         | Content                 | Status          | Notes             |
|-----------------|-------------------------|-----------------|-------------------|
| AnimeBytes (AB) | Anime                   | Torznab/Newznab | Top anime tracker |
| AnimeTorrents   | Anime                   | Planned         |                   |
| BakaBT          | Anime (complete series) | Planned         | Quality-focused   |
| U2              | Anime, Asian            | Torznab/Newznab | Chinese-based     |

### Music

| Tracker        | Content      | Status          | Notes             |
|----------------|--------------|-----------------|-------------------|
| RED (Redacted) | Music (FLAC) | Torznab/Newznab | Top music tracker |
| Orpheus        | Music (FLAC) | Torznab/Newznab | RED alternative   |
| Libble         | Music        | Planned         |                   |
| DICMusic       | Music        | Planned         |                   |

### Games

| Tracker            | Content     | Status          | Notes             |
|--------------------|-------------|-----------------|-------------------|
| GazelleGames (GGn) | Games       | Torznab/Newznab | Top games tracker |
| PixelCove          | Retro games | Planned         |                   |

### Specialized

| Tracker        | Content            | Status        | Notes                      |
|----------------|--------------------|---------------|----------------------------|
| OldToons.World | Classic cartoons   | **Supported** | UNIT3D-based, API key auth |
| HD-Space       | HD content         | Planned       |                            |
| HDTorrents     | HD content         | Planned       |                            |
| Anthelion      | eBooks, audiobooks | Planned       |                            |
| BitHDTV        | HD content         | Planned       |                            |
| TorrentSeeds   | General            | Planned       |                            |
| DanishBytes    | Danish content     | Planned       | Regional                   |
| NorBits        | Norwegian content  | Planned       | Regional                   |
| HDBits.ro      | Romanian HD        | Planned       | Regional                   |

---

## Usenet Indexers (NZB)

Cinephage supports Newznab-compatible usenet indexers via the built-in Newznab template.

| Indexer     | Type      | Status        | Notes                |
|-------------|-----------|---------------|----------------------|
| NZBGeek     | Paid      | **Supported** | Via Newznab template |
| DrunkenSlug | Paid      | **Supported** | Via Newznab template |
| NZB Finder  | Paid      | **Supported** | Via Newznab template |
| DOGnzb      | Paid      | **Supported** | Via Newznab template |
| NZBPlanet   | Paid      | **Supported** | Via Newznab template |
| Binsearch   | Free      | **Supported** | Via Newznab template |
| NZBKing     | Free/Paid | **Supported** | Via Newznab template |

> **Note**: Any Newznab-compatible indexer works with Cinephage. Add it via Settings > Indexers > Add Indexer > Newznab.

---

## Using Indexers

### Enabling Built-in Indexers

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer**
3. Select from available indexers:
   - **Public**: BitSearch, EZTV, Knaben, YTS
   - **Private**: OldToons.World (API key), SceneTime (cookie auth)
   - **Templates**: Torznab, Newznab
4. Configure settings as needed (API keys, cookies, etc.)
5. Test the indexer to verify connectivity

### Adding Newznab Indexers (Usenet)

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer** > **Newznab**
3. Enter connection details:
   - **Name**: Display name
   - **URL**: Your indexer's API URL
   - **API Key**: From your indexer account
4. Test and save

> **Note**: Cinephage automatically fetches the indexer's capabilities from `/api?t=caps` when you add or test the indexer. This determines which search parameters (tmdbid, imdbid, tvdbid, etc.) are supported, preventing API errors from unsupported parameters.

### Adding Torznab Indexers

Connect to Prowlarr or Jackett for torrent indexers:

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer** > **Torznab**
3. Enter connection details:
   - **Name**: Display name
   - **URL**: Prowlarr/Jackett URL
   - **API Key**: From your indexer manager
4. Test and save

> **Note**: Like Newznab, Cinephage fetches capabilities from `/api?t=caps` to determine supported search parameters. This ensures searches only use parameters the indexer actually supports.

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
protocol: torrent

caps:
  modes:
    search: [q]
    movie-search: [q, imdbid]
  categories:
    '2000': Movies
    '5000': TV

links:
  - https://example.com

search:
  paths:
    - path: /api/search
      method: get
  inputs:
    query: '{{ .Query.Q }}'

  response:
    type: json
  rows:
    selector: results

  fields:
    title:
      selector: name
    download:
      selector: torrent_url
    size:
      selector: size
    seeders:
      selector: seeds
```

### Definition Structure

| Section       | Purpose                                |
|---------------|----------------------------------------|
| `id`          | Unique identifier                      |
| `name`        | Display name                           |
| `description` | Brief description                      |
| `language`    | Primary language code                  |
| `type`        | `public`, `semi-private`, or `private` |
| `protocol`    | `torrent`, `usenet`, or `streaming`    |
| `caps`        | Supported categories and search modes  |
| `links`       | Site URLs (primary + fallbacks)        |
| `search`      | Search request configuration           |
| `login`       | Authentication (private trackers)      |

See existing definitions in `data/indexers/definitions/` for complete examples.

---

## Indexer Settings

### Rate Limiting

Each indexer has configurable rate limits:

- **Requests per minute**: Maximum API calls per minute
- **Cooldown**: Time to wait after rate limit hit

### Auto-Disable

Indexers that repeatedly fail are automatically disabled with exponential backoff:

| Failure | Cooldown       |
|---------|----------------|
| 1st     | 5 minutes      |
| 2nd     | 15 minutes     |
| 3rd     | 1 hour         |
| 4th+    | Up to 24 hours |

Re-enable manually in Settings after resolving issues.

### Health Monitoring

Monitor indexer health in **Settings > Integrations > Indexers**:

- **Status**: Enabled, disabled, rate-limited
- **Last Success**: Time of last successful search
- **Failure Count**: Consecutive failures
- **Response Time**: Average latency

---

## Search Result Deduplication

When searching across multiple indexers, Cinephage automatically deduplicates results to avoid showing the same torrent multiple times.

### How Deduplication Works

1. **Primary key**: Info hash (for torrents) - identical hashes mean identical content
2. **Fallback**: Normalized title comparison when no hash is available
3. **Preference**: When duplicates are found, the version with more seeders is kept

### Multi-Source Attribution

When the same torrent appears on multiple indexers (common with aggregators like Knaben that index other trackers), Cinephage tracks all sources via the `sourceIndexers` field.

**Example**: A YTS torrent that also appears on Knaben will show:

- `indexerName: "Knaben"` (the version with more seeders was kept)
- `sourceIndexers: ["YTS", "Knaben"]` (both indexers had it)

In the search results UI, releases from multiple indexers display all sources (e.g., "YTS, Knaben") so you can see which indexers found that release.

### Why This Matters

- **Aggregators** like Knaben index torrents from other trackers (YTS, 1337x, etc.)
- The **same torrent** (identical info hash) may appear from multiple sources
- Deduplication keeps the **best version** (most seeders) while crediting all sources
- This prevents duplicate results cluttering your search

---

## Contributing Indexers

Want to add support for an indexer? See the [Contributing Guide](../development/contributing.md) for guidelines on:

- Writing Cardigann YAML definitions
- Testing indexer definitions
- Submitting pull requests

The Prowlarr project maintains an extensive collection of indexer definitions that can serve as reference: [Prowlarr/Indexers](https://github.com/Prowlarr/Indexers)

---

**See also:** [Quality Profiles](quality-profiles.md) | [Monitoring](monitoring.md) | [Troubleshooting](../troubleshooting.md)
