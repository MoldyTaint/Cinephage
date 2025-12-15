[< Back to Index](../INDEX.md) | [Environment Variables](environment-variables.md)

# API Reference

Cinephage provides a REST API for all functionality. The API is used internally by the web UI and can be used for external integrations.

## Base URL

```
http://localhost:3000/api
```

Replace `localhost:3000` with your Cinephage instance address.

---

## Endpoint Categories

| Category   | Base Path         | Description            |
|------------|-------------------|------------------------|
| Discovery  | `/api/discover`   | TMDB search and browse |
| Library    | `/api/library`    | Library management     |
| Indexers   | `/api/indexers`   | Indexer configuration  |
| Search     | `/api/search`     | Multi-indexer search   |
| Queue      | `/api/queue`      | Download queue         |
| Download   | `/api/download`   | Download management    |
| Subtitles  | `/api/subtitles`  | Subtitle operations    |
| Monitoring | `/api/monitoring` | Automation settings    |
| Streaming  | `/api/streaming`  | Stream generation      |
| Settings   | `/api/settings`   | Configuration          |

---

## Discovery Endpoints

Browse and search content via TMDB.

### Browse Trending

```http
GET /api/discover
```

Query parameters:

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `type`    | string | `movie` or `tv`          |
| `page`    | number | Page number (default: 1) |

### Search TMDB

```http
GET /api/discover/search
```

Query parameters:

| Parameter | Type   | Description     |
|-----------|--------|-----------------|
| `query`   | string | Search query    |
| `type`    | string | `movie` or `tv` |
| `year`    | number | Filter by year  |

### Get Details

```http
GET /api/discover/:type/:id
```

Path parameters:

| Parameter | Type   | Description     |
|-----------|--------|-----------------|
| `type`    | string | `movie` or `tv` |
| `id`      | number | TMDB ID         |

---

## Library Endpoints

Manage your media library.

### List Movies

```http
GET /api/library/movies
```

Query parameters:

| Parameter   | Type    | Description                |
|-------------|---------|----------------------------|
| `page`      | number  | Page number                |
| `limit`     | number  | Items per page             |
| `sort`      | string  | Sort field                 |
| `monitored` | boolean | Filter by monitored status |

### List Series

```http
GET /api/library/series
```

Same parameters as movies.

### Add to Library

```http
POST /api/library/:type
```

Request body:

```json
{
  "tmdbId": 123456,
  "qualityProfileId": 1,
  "rootFolderId": 1,
  "monitored": true
}
```

### Trigger Library Scan

```http
POST /api/library/scan
```

Request body:

```json
{
  "path": "/optional/specific/path"
}
```

### Get Scan Status

```http
GET /api/library/status
```

---

## Search Endpoints

Search across configured indexers.

### Multi-Indexer Search

```http
POST /api/search
```

Request body:

```json
{
  "query": "Movie Name 2023",
  "type": "movie",
  "tmdbId": 123456,
  "indexerIds": [1, 2, 3]
}
```

Response includes results from all queried indexers with quality scores.

---

## Queue Endpoints

Manage the download queue.

### Get Queue

```http
GET /api/queue
```

Returns current downloads with status, progress, and ETA.

### Get History

```http
GET /api/queue/history
```

Query parameters:

| Parameter | Type   | Description    |
|-----------|--------|----------------|
| `page`    | number | Page number    |
| `limit`   | number | Items per page |

### Remove from Queue

```http
DELETE /api/queue/:id
```

Query parameters:

| Parameter          | Type    | Description                      |
|--------------------|---------|----------------------------------|
| `removeFromClient` | boolean | Also remove from download client |
| `blocklist`        | boolean | Add release to blocklist         |

---

## Indexer Endpoints

Configure torrent indexers.

### List Indexers

```http
GET /api/indexers
```

### Add Indexer

```http
POST /api/indexers
```

Request body varies by indexer type. See Settings UI for available fields.

### Test Indexer

```http
POST /api/indexers/test
```

Request body:

```json
{
  "id": 1
}
```

Or for new indexer:

```json
{
  "type": "torznab",
  "url": "http://...",
  "apiKey": "..."
}
```

### Update Indexer

```http
PUT /api/indexers/:id
```

### Delete Indexer

```http
DELETE /api/indexers/:id
```

---

## Subtitle Endpoints

Manage subtitles.

### Search Subtitles

```http
POST /api/subtitles/search
```

Request body:

```json
{
  "mediaId": 123,
  "mediaType": "movie",
  "languages": ["en", "es"]
}
```

### Download Subtitle

```http
POST /api/subtitles/download
```

Request body:

```json
{
  "mediaId": 123,
  "subtitleId": "provider-specific-id",
  "provider": "opensubtitles"
}
```

---

## Download Endpoints

Trigger downloads.

### Grab Release

```http
POST /api/download/grab
```

Request body:

```json
{
  "releaseId": "indexer-release-id",
  "indexerId": 1,
  "mediaId": 123,
  "mediaType": "movie"
}
```

---

## Settings Endpoints

Configure Cinephage settings.

### Get Settings

```http
GET /api/settings
```

### Update Settings

```http
PUT /api/settings
```

Request body contains settings to update.

### Test Download Client

```http
POST /api/settings/download-client/test
```

---

## Response Format

All endpoints return JSON with consistent structure:

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

---

## Error Codes

| Code                    | Description                          |
|-------------------------|--------------------------------------|
| `NOT_FOUND`             | Resource not found                   |
| `VALIDATION_ERROR`      | Invalid request data                 |
| `INDEXER_ERROR`         | Indexer communication failed         |
| `DOWNLOAD_CLIENT_ERROR` | Download client communication failed |
| `TMDB_ERROR`            | TMDB API error                       |
| `RATE_LIMITED`          | Too many requests                    |

---

**See also:** [Environment Variables](environment-variables.md) | [Troubleshooting](../troubleshooting.md)
