[< Back to Index](../INDEX.md) | [Indexers](indexers.md) | [Subtitles](subtitles.md)

# Quality Profiles

Cinephage uses a scoring system to evaluate and compare torrent releases, helping you get the best quality for your preferences.

## Built-in Profiles

Four profiles cover common use cases:

| Profile      | Focus                           | Use Case                               |
| ------------ | ------------------------------- | -------------------------------------- |
| **Quality**  | Maximum quality                 | Remux, lossless audio, quality purists |
| **Balanced** | Quality with efficient encoding | x265/AV1 from quality groups           |
| **Compact**  | Small files, decent quality     | Micro encodes, limited storage         |
| **Streamer** | Streaming only                  | .strm files, instant playback          |

### Quality Profile

- Prioritizes highest quality regardless of file size
- Prefers Remux, then BluRay encodes
- Values lossless audio (TrueHD, DTS-HD MA)
- Prefers HDR formats (Dolby Vision, HDR10+)
- Uses top-tier release groups
- Continuously upgrades until hitting the best possible

### Balanced Profile

- High quality with efficient encoding
- Prefers x265/HEVC and AV1 codecs
- Values quality encoding groups
- Good balance of quality and file size
- Suitable for limited storage with quality priority

### Compact Profile

- Small files with decent quality
- Prefers efficient micro-encode groups
- Accepts standard audio codecs
- Lowest minScore threshold (-5000) for flexibility
- Ideal for limited storage or bandwidth

### Streamer Profile

- Streaming-only via .strm files
- Instant playback with no downloads
- No upgrades (streams don't upgrade)
- Only uses streaming protocol
- Ideal for cloud-based media consumption

---

## Scoring System

Releases are scored based on multiple factors. Higher scores indicate better quality.

### Resolution + Source (0-20000 points)

| Quality      | Score |
| ------------ | ----- |
| 2160p Remux  | 20000 |
| 2160p BluRay | 18000 |
| 2160p Web-DL | 15000 |
| 1080p Remux  | 14000 |
| 1080p BluRay | 12000 |
| 1080p Web-DL | 10000 |
| 720p BluRay  | 7000  |
| 720p Web-DL  | 5000  |

### Audio Codec (0-2000 points)

| Codec        | Score |
| ------------ | ----- |
| TrueHD Atmos | 2000  |
| DTS-HD MA    | 1800  |
| TrueHD       | 1600  |
| DTS-X        | 1500  |
| Atmos        | 1400  |
| DTS-HD       | 1200  |
| DTS          | 800   |
| AAC          | 400   |

### HDR Format (0-1000 points)

| Format       | Score |
| ------------ | ----- |
| Dolby Vision | 1000  |
| HDR10+       | 800   |
| HDR10        | 600   |

### Release Group Tiers (0-500 points)

| Tier    | Examples        | Score |
| ------- | --------------- | ----- |
| Tier 1  | FraMeSToR, etc. | 500   |
| Tier 2  | SPARKS, etc.    | 300   |
| Tier 3  | RARBG, etc.     | 100   |
| Unknown | -               | 0     |

### Penalties

| Condition         | Score  |
| ----------------- | ------ |
| Banned groups     | -10000 |
| Cam/Screener      | -5000  |
| Low quality audio | -500   |
| Streaming rips    | -200   |

---

## Custom Profiles

> **Work in Progress**: Custom profiles are under active development and not fully tested. Use with caution.

The UI in Settings > Profiles allows basic profile creation, but this feature is incomplete. The 4 built-in profiles (Quality, Balanced, Compact, Streamer) are the recommended option for now.

---

**See also:** [Indexers](indexers.md) | [Monitoring](monitoring.md) | [Troubleshooting](../troubleshooting.md)
