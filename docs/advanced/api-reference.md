# API Reference

Cinephage provides a RESTful API for all operations. Base URL: `/api`

---

## Authentication

Currently single-user with password protection via session cookie.

---

## Common Endpoints

### System

```
GET    /api/health              - Health check
GET    /api/system/status       - System status
GET    /api/system/logs         - Recent logs
```

### Library

```
GET    /api/library/movies      - List movies
GET    /api/library/movies/:id  - Movie details
POST   /api/library/movies      - Add movie
PUT    /api/library/movies/:id  - Update movie
DELETE /api/library/movies/:id  - Remove movie

GET    /api/library/series      - List series
GET    /api/library/series/:id  - Series details
POST   /api/library/series      - Add series
```

### Queue

```
GET    /api/queue               - Download queue
POST   /api/queue/:id/grab      - Grab release
POST   /api/queue/:id/remove    - Remove from queue
```

### Search

```
GET    /api/search/movie/:id    - Search for movie
GET    /api/search/episode/:id  - Search for episode
```

### Workers

```
GET    /api/workers             - List workers
GET    /api/workers/:id         - Worker details
POST   /api/workers/:id/cancel  - Cancel task
```

---

## Response Format

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

## Rate Limiting

API endpoints have rate limits:

- **General**: 100 requests/minute
- **Search**: 30 requests/minute
- **Import**: 10 requests/minute

---

## See Also

- Full API documentation available via OpenAPI spec at `/api/docs`
