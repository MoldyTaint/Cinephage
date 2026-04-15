#!/usr/bin/env bash

set -euo pipefail

: "${SOURCE_IMAGE:?SOURCE_IMAGE is required}"
: "${LATEST_IMAGE:?LATEST_IMAGE is required}"
: "${SOURCE_TAG:?SOURCE_TAG is required}"

DRY_RUN="${DRY_RUN:-false}"
VERIFY_RETRIES="${VERIFY_RETRIES:-12}"
VERIFY_DELAY_SECONDS="${VERIFY_DELAY_SECONDS:-5}"
SUMMARY_HEADING="${SUMMARY_HEADING:-## GHCR Promote Latest}"

resolve_digest() {
	local image="$1"
	docker buildx imagetools inspect "$image" 2>/dev/null | awk '/^Digest:/ {print $2; exit}'
}

append_summary() {
	if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
		return
	fi

	printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
}

SOURCE_DIGEST="$(resolve_digest "$SOURCE_IMAGE")"
CURRENT_LATEST_DIGEST="$(resolve_digest "$LATEST_IMAGE" || true)"

if [ -z "$SOURCE_DIGEST" ]; then
	echo "Failed to resolve digest for source image: ${SOURCE_IMAGE}"
	exit 1
fi

echo "Source image: ${SOURCE_IMAGE}"
echo "Source tag: ${SOURCE_TAG}"
echo "Source digest: ${SOURCE_DIGEST}"
if [ -n "$CURRENT_LATEST_DIGEST" ]; then
	echo "Current latest digest: ${CURRENT_LATEST_DIGEST}"
else
	echo "Current latest digest: <none>"
fi

if [ "$DRY_RUN" = 'true' ]; then
	echo "DRY RUN: would copy ${SOURCE_IMAGE} -> ${LATEST_IMAGE}"
	append_summary \
		"${SUMMARY_HEADING}" \
		"- Source tag: \`${SOURCE_TAG}\`" \
		"- Source digest: \`${SOURCE_DIGEST}\`" \
		"- Current latest digest: \`${CURRENT_LATEST_DIGEST:-<none>}\`" \
		"- Action: would copy \`${SOURCE_IMAGE}\` to \`${LATEST_IMAGE}\`"
	exit 0
fi

if [ "$CURRENT_LATEST_DIGEST" = "$SOURCE_DIGEST" ]; then
	echo "latest already points to ${SOURCE_TAG}; no registry write required"
	append_summary \
		"${SUMMARY_HEADING}" \
		"- Source tag: \`${SOURCE_TAG}\`" \
		"- Source digest: \`${SOURCE_DIGEST}\`" \
		"- Current latest digest: \`${CURRENT_LATEST_DIGEST}\`" \
		"- Result: `latest` already points to \`${SOURCE_TAG}\`"
	exit 0
fi

echo "Promoting ${SOURCE_IMAGE} to ${LATEST_IMAGE} via manifest copy"
docker buildx imagetools create -t "$LATEST_IMAGE" "$SOURCE_IMAGE"

NEW_LATEST_DIGEST=''
for attempt in $(seq 1 "$VERIFY_RETRIES"); do
	NEW_LATEST_DIGEST="$(resolve_digest "$LATEST_IMAGE" || true)"
	echo "Verification attempt ${attempt}/${VERIFY_RETRIES}: latest=${NEW_LATEST_DIGEST:-<unavailable>}"

	if [ "$NEW_LATEST_DIGEST" = "$SOURCE_DIGEST" ]; then
		break
	fi

	if [ "$attempt" -lt "$VERIFY_RETRIES" ]; then
		sleep "$VERIFY_DELAY_SECONDS"
	fi
done

if [ "$NEW_LATEST_DIGEST" != "$SOURCE_DIGEST" ]; then
	echo "latest digest does not match source digest after promotion"
	echo "source=${SOURCE_DIGEST}"
	echo "latest=${NEW_LATEST_DIGEST:-<unavailable>}"
	exit 1
fi

echo "latest now points to ${SOURCE_TAG} (${NEW_LATEST_DIGEST})"
append_summary \
	"${SUMMARY_HEADING}" \
	"- Source tag: \`${SOURCE_TAG}\`" \
	"- Source digest: \`${SOURCE_DIGEST}\`" \
	"- Previous latest digest: \`${CURRENT_LATEST_DIGEST:-<none>}\`" \
	"- New latest digest: \`${NEW_LATEST_DIGEST}\`" \
	"- Result: `latest` now points to \`${SOURCE_TAG}\`"
