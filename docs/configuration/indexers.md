# Indexers

Cinephage searches indexers to find releases for your movies and TV shows. It includes 8 built-in indexers plus templates for connecting external sources.

---

## Built-in Indexers

### Public Indexers

These work immediately without configuration:

| Indexer   | Content             | Notes                                  |
| --------- | ------------------- | -------------------------------------- |
| BitSearch | Movies, TV, General | DHT search engine, large database      |
| EZTV      | TV Shows            | Fast TV releases, large library        |
| Knaben    | Movies, TV          | Multi-tracker aggregator               |
| YTS       | Movies              | Compressed encodes, huge movie library |

### Private Trackers

Require credentials:

| Indexer        | Auth Type | Notes            |
| -------------- | --------- | ---------------- |
| OldToons.World | API Key   | Classic cartoons |
| SceneTime      | Cookie    | Scene releases   |

### Internal

Built-in special-purpose indexer:

| Indexer           | Purpose   | Notes                                                    |
| ----------------- | --------- | -------------------------------------------------------- |
| Cinephage Library | Streaming | Streams content via .strm files from streaming providers |

### Templates

For connecting usenet indexers:

| Template | Protocol | Use With                              |
| -------- | -------- | ------------------------------------- |
| Newznab  | Usenet   | NZBGeek, DrunkenSlug, NZBFinder, etc. |

---

## Adding Indexers

### Enable Built-in Indexers

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer**
3. Select from the list of available indexers
4. Configure credentials if required
5. Click **Test** to verify
6. Save

### Add Newznab Indexer (Usenet)

For usenet indexers like NZBGeek, DrunkenSlug, or NZBFinder:

1. Navigate to **Settings > Integrations > Indexers**
2. Click **Add Indexer** > **Newznab**
3. Enter:
   - **Name**: Display name
   - **URL**: Indexer's API URL
   - **API Key**: From your indexer account
4. Click **Test** and save

---

## Indexer Settings

### Per-Indexer Configuration

Each indexer can be configured with:

| Setting        | Description                  |
| -------------- | ---------------------------- |
| **Enabled**    | Toggle indexer on/off        |
| **Priority**   | Search order (lower = first) |
| **Categories** | Which categories to search   |

### Rate Limiting

Cinephage respects indexer rate limits:

- Each indexer has configurable request limits
- Requests are queued when limits are reached
- Limits vary by indexer (API vs scraper)

### Auto-Disable

Indexers that repeatedly fail are automatically disabled:

| Failures | Cooldown       |
| -------- | -------------- |
| 1        | 5 minutes      |
| 2        | 15 minutes     |
| 3        | 1 hour         |
| 4+       | Up to 24 hours |

Re-enable manually after resolving the issue.

---

## Indexer Health

Monitor indexer status in **Settings > Integrations > Indexers**:

| Indicator | Meaning                |
| --------- | ---------------------- |
| Green     | Working normally       |
| Yellow    | Rate limited or slow   |
| Red       | Failing, auto-disabled |
| Gray      | Manually disabled      |

### Health Details

- **Status**: Current state
- **Last Success**: When last search succeeded
- **Failure Count**: Consecutive failures
- **Response Time**: Average latency

---

## Search Deduplication

When the same release appears on multiple indexers:

1. Results are deduplicated by info hash
2. Version with most seeders is kept
3. All source indexers are credited
4. UI shows all sources (e.g., "YTS, Knaben")

---

## Custom Indexers

Advanced users can create custom YAML definitions.

### Location

Place definitions in: `data/indexers/definitions/` (Docker: `/config/data/indexers/definitions/`)

### Format

Cinephage uses Cardigann-compatible YAML:

```yaml
id: my-indexer
name: My Indexer
description: A custom indexer
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
    - path: /search
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
      selector: torrent
    size:
      selector: size
    seeders:
      selector: seeds
```

See existing definitions in `data/indexers/definitions/` for examples (Docker: `/config/data/indexers/definitions/`).

---

## Cloudflare Protection

Some indexers use Cloudflare protection. Cinephage includes:

- Built-in Captcha Solver using Camoufox (anti-detect Firefox browser)
- Automatic challenge detection and solving
- Cookie caching to minimize solves
- Fallback to alternative indexers when blocked

Configure the Captcha Solver in Settings > Integrations > Captcha Solver.

---

## Troubleshooting

### No Results

1. Check if indexer is enabled and healthy
2. Verify search terms work on the indexer's website
3. Check if indexer supports the content type (movies vs TV)
4. Try a different indexer

### Rate Limited

1. Wait for cooldown to expire
2. Reduce search frequency in monitoring settings
3. Consider adding more indexers to spread load

### Authentication Failed

1. Verify API key or credentials are correct
2. Check if account is active on the indexer
3. Re-generate API key if necessary

---

**See also:** [Search & Download](../features/search-and-download.md) | [Download Clients](download-clients.md) | [Troubleshooting](../support/troubleshooting.md)
