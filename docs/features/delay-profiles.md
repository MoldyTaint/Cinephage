# Delay Profiles

Delay Profiles prevent Cinephage from grabbing low-quality releases immediately after they appear. Instead, releases wait in a queue and are only grabbed if nothing better appears within the delay period.

---

## Why Use Delays?

### The Problem

A new episode airs:

- **T+0 minutes**: HDTV capture appears (low quality)
- **T+30 minutes**: WEB-DL appears (better quality)
- **T+2 hours**: BluRay appears (best quality)

Without delays, Cinephage grabs the HDTV immediately. With delays, it waits to see if something better appears.

### The Solution

Delay profiles let you:

- **Wait for better quality** — WEB-DL instead of HDTV
- **Prefer usenet** — Wait for usenet releases instead of torrents
- **Avoid fakes** — Let the community verify releases first
- **Get proper releases** — PROPER/REPACK fixes often appear within hours

---

## How Delay Profiles Work

### The Pending Queue

When a monitored item is found:

1. **Release appears** — Quality meets cutoff
2. **Added to pending** — Not grabbed yet
3. **Timer starts** — Delay period begins
4. **Better release?** — If yes, replace in queue
5. **Timer expires** — Grab best release in queue

### Quality Upgrades During Delay

If a better quality release appears during the delay:

- **Replaces** the pending release
- **Timer resets** (optional)
- **Only if score is higher** — Not just different

---

## Creating a Delay Profile

Navigate to **Settings > Quality > Delay Profiles**:

### Basic Settings

| Setting      | Description              | Example           |
| ------------ | ------------------------ | ----------------- |
| **Name**     | Profile name             | "Wait for WEB-DL" |
| **Protocol** | Usenet, Torrent, or Both | Both              |
| **Delay**    | Hours to wait            | 6 hours           |

### Protocol-Specific Delays

Different delays for different protocols:

| Protocol    | Delay    | Use Case                |
| ----------- | -------- | ----------------------- |
| **Torrent** | 12 hours | Wait for scene releases |
| **Usenet**  | 0 hours  | Grab usenet immediately |

This prefers usenet but falls back to torrents after 12 hours.

---

## Bypass Conditions

Sometimes you don't want to wait. Set conditions to bypass the delay:

### Bypass if Highest Quality

```
Bypass if: Release meets highest quality in profile
Example: 2160p BluRay appears (nothing better exists)
```

### Bypass if Score Threshold

```
Bypass if: Score >= 2000
Example: Trusted group + high quality = grab now
```

### Bypass Tags

Apply bypass to specific content:

```
Tag: "no-delay"
Applies to: Movies/Series with this tag bypass delay
```

---

## Example Profiles

### Conservative (Recommended)

```
Name: Conservative
Torrent Delay: 24 hours
Usenet Delay: 0 hours
Bypass: Highest quality only

Result: Waits for scene releases, grabs usenet immediately
```

### Aggressive

```
Name: Aggressive
Torrent Delay: 2 hours
Usenet Delay: 0 hours
Bypass: Score >= 1500

Result: Quick grabs, but only if high quality
```

### Usenet Only

```
Name: Usenet Preferred
Torrent Delay: 72 hours
Usenet Delay: 0 hours
Bypass: Never

Result: Only grabs torrents if usenet fails for 3 days
```

---

## Assigning Delay Profiles

### Global Default

Set a default profile in **Settings > Quality > Delay Profiles**:

- Applies to all new monitored items
- Can be overridden per-item

### Per-Movie/Series

Override the default for specific content:

1. Go to movie/series details
2. Click **Edit**
3. Select delay profile
4. Save

### Use Cases for Overrides

- **Daytime TV** — Use aggressive (low quality expected)
- **Premium Shows** — Use conservative (wait for best)
- **Old Movies** — No delay (quality won't improve)

---

## The Pending Releases Queue

View all delayed releases:

**Settings > Tasks > Pending Releases**

| Column         | Description             |
| -------------- | ----------------------- |
| **Title**      | Movie or episode        |
| **Release**    | Release name            |
| **Quality**    | Quality score           |
| **Protocol**   | Usenet or Torrent       |
| **Delay Ends** | When it will be grabbed |
| **Actions**    | Grab now / Remove       |

### Manual Actions

- **Grab Now** — Bypass delay and download immediately
- **Remove** — Remove from queue (won't grab)
- **View Details** — See why it's pending

---

00

## How Delays Interact with Other Features

### Quality Profiles

Delay + Quality work together:

1. Quality profile determines "acceptable" releases
2. Delay profile determines "when to grab"
3. Only releases meeting quality cutoff enter pending queue

### Custom Formats

Custom format scores affect delay bypass:

- High score releases may bypass delay
- Score is calculated before delay is applied

### Monitoring

Monitoring tasks respect delays:

- Missing content search → Adds to pending
- Upgrade monitoring → Replaces pending if better
- Cutoff unmet → Ignores delay (grabs immediately)

---

## Troubleshooting

### Releases Not Being Grabbed

1. **Check pending queue** — May be waiting in delay
2. **Verify delay profile assigned** — Default vs per-item
3. **Check bypass conditions** — May not be met

### Delay Too Long

1. **Reduce delay hours** — Start with 6-12 hours
2. **Add bypass conditions** — Score threshold, highest quality
3. **Use tags** — Bypass for specific content

### Delay Being Ignored

1. **Check cutoff unmet** — Ignores delays
2. **Check manual search** — Manual grabs bypass delay
3. **Check bypass tags** — Item may have bypass tag

### Conflicting Profiles

If multiple profiles apply:

- **Per-item overrides global**
- **More specific wins** (e.g., series vs global)
- **First match applies**

---

## Best Practices

### Start Conservative

Begin with longer delays, then reduce:

- **Week 1**: 24 hour delay
- **Week 2**: 12 hour delay
- **Week 3**: 6 hour delay

Find the sweet spot for your indexers.

### Match Delay to Content

| Content Type    | Suggested Delay |
| --------------- | --------------- |
| New TV episodes | 6-12 hours      |
| Movies (new)    | 12-24 hours     |
| Movies (old)    | 0-2 hours       |
| Anime           | 2-6 hours       |

### Monitor Your Indexers

Different indexers have different release patterns:

- **Scene trackers** — Releases appear at predictable times
- **Public indexers** — More variable, shorter delays okay
- **Usenet** — Usually faster, can use 0 delay

---

## See Also

- [Quality Profiles](quality-profiles.md) — How quality scoring works
- [Custom Formats](custom-formats.md) — Advanced scoring rules
- [Monitoring](monitoring.md) — Automated search tasks
