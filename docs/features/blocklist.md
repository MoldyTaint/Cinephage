# Blocklist

The Blocklist prevents Cinephage from re-downloading releases that have previously failed or been rejected. Once a release is blocklisted, it won't be considered for future searches or upgrades.

---

## Why Use the Blocklist?

### Common Scenarios

- **Failed downloads** — Dead torrents, broken NZBs
- **Fake releases** — Password-protected RARs, wrong content
- **Wrong language** — Hardcoded foreign subtitles
- **Bad quality** — CAM/TS when expecting BluRay
- **Import failures** — Corrupted files, permission issues

### Benefits

- **Prevents loops** — Won't keep trying the same bad release
- **Saves bandwidth** — No redundant downloads
- **Cleaner results** — Failed releases hidden from search
- **Automatic** — Blocks added on failure, manual for other reasons

---

## How Blocking Works

### Automatic Blocking

Cinephage automatically blocklists releases when:

| Event            | Block Reason      | Duration  |
| ---------------- | ----------------- | --------- |
| Download fails   | `download_failed` | Permanent |
| Import fails     | `import_failed`   | Permanent |
| Manual rejection | `manual`          | Permanent |
| Wrong language   | `wrong_language`  | Permanent |

### Block Identifiers

Releases are identified by:

- **Info hash** (torrents) — Primary identifier
- **NZB ID** (usenet) — For usenet releases
- **Release name** — Fallback matching

---

## Managing the Blocklist

### View Blocklist

Navigate to **Settings > Tasks > Blocklist**:

| Column           | Description        |
| ---------------- | ------------------ |
| **Release**      | Release name       |
| **Movie/Series** | Associated title   |
| **Reason**       | Why it was blocked |
| **Date**         | When blocked       |
| **Actions**      | Remove / Details   |

### Manual Blocking

Block a release manually:

1. **From search results** — Click **Block** next to release
2. **From download history** — Click **Block** on failed item
3. **Bulk block** — Select multiple, click **Block Selected**

### Removing Blocks

Remove items from blocklist:

1. **Single item** — Click **Remove** on blocklist entry
2. **Bulk remove** — Select multiple, click **Remove Selected**
3. **Clear all** — **Clear Blocklist** button (use with caution)

---

## Block Reasons

### System-Generated Reasons

| Reason             | When Used                                       |
| ------------------ | ----------------------------------------------- |
| `download_failed`  | Torrent dead, NZB removed, connection error     |
| `import_failed`    | File corrupted, wrong format, permission denied |
| `upgrade_rejected` | Better release found before download completed  |
| `manual`           | User clicked "Block" manually                   |

### Custom Reasons

When blocking manually, you can specify a custom reason:

```
Reason: "Wrong episode"
Reason: "Fake release - password protected"
Reason: "Hardcoded Spanish subs"
```

---

## Blocklist Scope

### Per-Title Blocking

Blocks apply to specific movies/episodes:

- **Movie A** — Blocked release won't be tried for Movie A
- **Movie B** — Same release may still work for Movie B

This prevents over-blocking when a release works for some content but not others.

### Global Blocking (Future Feature)

Currently blocks are per-title. Future versions may support:

- Global block by info hash (all titles)
- Block by release group
- Block by uploader

---

## Blocklist in Search Results

### Visual Indicators

Blocked releases are marked in search:

- **Strikethrough** — Release name crossed out
- **"Blocked" badge** — Red badge with block reason
- **Hidden by default** — Filter to show/hide blocked

### Show/Hide Blocked

Toggle visibility in search:

```
Search Filters:
  [✓] Show available releases
  [ ] Show blocklisted releases  ← Uncheck to hide
```

---

## Blocklist and Monitoring

### How Monitoring Uses Blocklist

When monitoring searches for upgrades:

1. **Search indexers** — Get all matching releases
2. **Filter blocked** — Remove blocklisted releases
3. **Score remaining** — Apply quality/custom format scoring
4. **Grab best** — Download highest-scoring unblocked release

### Blocked Releases Don't Count

A blocked release won't:

- Satisfy "missing content" monitoring
- Count toward quality cutoff
- Be considered for upgrades

### Exception: Cutoff Unmet

The "Cutoff Unmet" task ignores the blocklist:

- If all releases are blocked, it tries the best blocked one
- Prevents permanent "no releases available" state

---

## Best Practices

### When to Block

**Always block:**

- Dead torrents (0 seeders, won't download)
- Fake/password-protected releases
- Completely wrong content

**Consider blocking:**

- Releases with hardcoded subs in wrong language
- Consistently problematic release groups
- Releases that fail import repeatedly

**Don't block:**

- Releases that failed due to temporary issues
- Good releases that you just don't want right now
- Items you might want to retry later

### Clean Up Regularly

Blocklist can grow over time:

- **Review monthly** — Remove blocks for old issues
- **Clear resolved** — If indexer fixed the problem
- **Export before clearing** — Keep record if needed

### Use Descriptive Reasons

When blocking manually, be specific:

- **Bad**: "Failed"
- **Good**: "Dead torrent - 0 seeders for 7 days"
- **Bad**: "Wrong"
- **Good**: "Wrong episode - S01E01 instead of S01E02"

---

## Troubleshooting

### Release Keeps Being Grabbed

If a blocked release is still being downloaded:

1. **Check blocklist** — Verify it's actually blocked
2. **Check identifier** — May have different info hash
3. **Check scope** — Blocked for one title but not another
4. **Clear and re-block** — Block may be corrupted

### Can't Block Release

If block option is unavailable:

1. **Check permissions** — Admin access required
2. **Check if already blocked** — May be duplicate
3. **Check search results** — Only available on search/history pages

### Blocklist Too Large

If blocklist is impacting performance:

1. **Clear old entries** — Remove blocks > 6 months old
2. **Export and archive** — Save to file, then clear
3. **Use bulk remove** — Filter by reason, remove in batches

---

## Integration with Other Features

### Search & Download

- Blocked releases filtered from results
- Can toggle visibility with filter
- Block button available on each result

### Download History

- Failed items show "Block" button
- Block reason auto-set to failure type
- Blocked items marked in history list

### Quality Profiles

- Blocked releases don't count toward cutoff
- May cause "cutoff unmet" state if all blocked
- Cutoff unmet task ignores blocklist

---

## See Also

- [Search & Download](search-and-download.md) — How releases are found and grabbed
- [Monitoring](monitoring.md) — Automated search tasks
- [Troubleshooting](../support/troubleshooting.md) — Common issues
