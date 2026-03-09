# Cinephage Integration Guide

Last Updated: March 2026

This is the document Cinephage client developers should use when wiring the app to `CinephageAPI`.

## What The API Expects

The API accepts Cinephage runtime requests only when all of the following are true:

1. `X-Cinephage-Version` is present.
2. `X-Cinephage-Commit` is present.
3. `X-Cinephage-Timestamp` is present.
4. The timestamp is within plus or minus 30 seconds of current time.
5. The version and commit exactly match the single current release registered in the API.

There is no N-1 support, no tag support, and no fallback build acceptance.

## Runtime Headers

Every Cinephage request to streams or IPTV must include:

```text
X-Cinephage-Version
X-Cinephage-Commit
X-Cinephage-Timestamp
```

Example:

```bash
curl "https://api.cinephage.net/api/v1/stream/155?type=movie" \
  -H "X-Cinephage-Version: 2.1.0" \
  -H "X-Cinephage-Commit: abc123def456" \
  -H "X-Cinephage-Timestamp: $(date +%s)"
```

## Client Example

See `api/docs/cinephage-client-example.ts` for a minimal client helper.

Typical client code:

```typescript
const headers = {
	'X-Cinephage-Version': import.meta.env.VITE_CINEPHAGE_VERSION,
	'X-Cinephage-Commit': import.meta.env.VITE_CINEPHAGE_COMMIT,
	'X-Cinephage-Timestamp': String(Math.floor(Date.now() / 1000))
};
```

Build-time env vars:

```bash
VITE_CINEPHAGE_VERSION=2.1.0
VITE_CINEPHAGE_COMMIT=abc123def456
```

## Release Update Endpoint

The Cinephage workflow updates the API through a single endpoint:

```text
POST https://api.cinephage.net/update/release
```

Auth:

```text
Authorization: Bearer $AUTOMATION_API_KEY
```

Body:

```json
{
	"commit": "abc123def456",
	"version": "2.1.0"
}
```

Example:

```bash
curl -X POST "https://api.cinephage.net/update/release" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTOMATION_API_KEY" \
  -d '{"commit":"abc123def456","version":"2.1.0"}'
```

Expected response:

```json
{
	"success": true,
	"release": {
		"version": "2.1.0",
		"commit": "abc123def456",
		"createdAt": 1772946363994,
		"updatedBy": "automation"
	}
}
```

## Recommended GitHub Workflow Flow

1. Resolve the Cinephage app version.
2. Resolve the git commit.
3. Call `POST /update/release` with `AUTOMATION_API_KEY`.
4. Build and deploy the Cinephage app with the same version and commit embedded.
5. Send the three runtime headers on every request.

Current workflow reference: `.github/workflows/register-tag.yml`

Minimal example:

```yaml
- name: Sync current release with API
  env:
    API_URL: ${{ secrets.CINEPHAGE_API_URL || 'https://api.cinephage.net' }}
    AUTOMATION_KEY: ${{ secrets.AUTOMATION_API_KEY }}
  run: |
    RESPONSE=$(curl -sS -X POST "${API_URL}/update/release" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${AUTOMATION_KEY}" \
      -d "{\"commit\":\"${COMMIT}\",\"version\":\"${VERSION}\"}")

    echo "${RESPONSE}" | jq .

    if ! echo "${RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
      exit 1
    fi
```

## Operational Notes

- `AUTOMATION_API_KEY` is a Cloudflare Worker secret, not a client secret.
- Never ship `AUTOMATION_API_KEY` in Cinephage builds.
- The API uses one current release only. As soon as the new release propagates, older clients fail authentication.
- Workers KV has a short propagation window. Right after `POST /update/release`, some edge locations may take a few seconds to converge.

## Practical Release Advice

- Keep `version` and `commit` exact across workflow, build output, and runtime headers.
- Do not bump the client version without updating the API release.
- Do not update the API release to a commit/version pair that the client build is not actually using.
- After syncing a release, verify `GET /health` shows the expected version before treating rollout as complete.

## Failure Modes

`401 Unauthorized` usually means one of these:

1. Missing one or more Cinephage headers.
2. Client timestamp is stale or too far in the future.
3. Client version does not match the current API release.
4. Client commit does not match the current API release.
5. `AUTOMATION_API_KEY` is wrong when calling `/update/release`.

`400 Bad Request` on `/update/release` usually means the request body is missing `commit` or `version`.

`405 Method Not Allowed` on `/update/release` means the request was not a `POST`.

## Quick Verification Checklist

For a new Cinephage release, verify all of the following:

1. `POST /update/release` returns `success: true`.
2. `GET /health` reports the expected version.
3. A request with the new `X-Cinephage-Version` and `X-Cinephage-Commit` succeeds.
4. A request with the old version or old commit fails with `401` after propagation settles.
