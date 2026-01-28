# Custom Formats

Custom Formats allow you to create personalized scoring rules that go beyond the built-in quality profiles. Define exactly what you want in a release and Cinephage will prioritize it.

---

## What Are Custom Formats?

Think of them as "search filters with scores":

- **Conditions** — Match specific text patterns in release names
- **Score** — Add or subtract points when conditions match
- **Priority** — Higher scores = preferred releases

---

## Creating a Custom Format

Navigate to **Settings > Quality > Custom Formats**:

### 1. Basic Information

- **Name** — Descriptive name (e.g., "x265 Preferred", "No HDR")
- **Description** — Optional explanation

### 2. Add Conditions

Click **Add Condition** and choose a type:

#### Condition Types

| Type              | Matches           | Example                                   |
| ----------------- | ----------------- | ----------------------------------------- |
| **Release Title** | Full release name | `Movie.Name.2023.1080p.BluRay.x264-Group` |
| **Resolution**    | Video resolution  | 720p, 1080p, 2160p                        |
| **Source**        | Release source    | BluRay, WEB-DL, HDTV                      |
| **Codec**         | Video codec       | x264, x265, AV1                           |
| **Audio**         | Audio format      | DTS, AAC, TrueHD                          |
| **HDR**           | HDR format        | HDR10, Dolby Vision                       |
| **Release Group** | Encoder group     | SPARKS, RARBG, YIFY                       |
| **Size**          | File size range   | 1-4 GB                                    |

### 3. Set Match Logic

- **Must Contain** — All conditions must match
- **Must Not Contain** — Release is rejected if matches
- **Should Contain** — Optional, adds score if matches

### 4. Assign Score

- **Positive score** — Prefer these releases
- **Negative score** — Avoid these releases
- **Reject** — Block entirely (score: -10000)

---

## Example Custom Formats

### Prefer x265/HEVC

```
Name: x265 Preferred
Conditions:
  - Codec: x265 (score: +100)
  - Codec: HEVC (score: +100)
  - Codec: x264 (score: -50)
```

### Block Low-Quality Groups

```
Name: Block Cam Releases
Conditions:
  - Release Title contains: CAM (reject: true)
  - Release Title contains: TS (reject: true)
  - Release Title contains: HDCAM (reject: true)
```

### Prefer Specific Group

```
Name: SPARKS Preferred
Conditions:
  - Release Group: SPARKS (score: +200)
```

### Size Limits

```
Name: Reasonable Size
Conditions:
  - Size: 500MB - 8GB (score: +50)
  - Size: >15GB (score: -100)
```

---

## Using Custom Formats

### Assign to Quality Profile

1. Go to **Settings > Quality > Quality Profiles**
2. Edit a profile
3. Under "Custom Formats", enable your formats
4. Set minimum score if needed

### Score Calculation

Total Score = Base Profile Score + Sum of Custom Format Scores

Example:

- Base (Balanced profile): +500
- x265 Preferred matches: +100
- SPARKS Preferred matches: +200
- **Total: +800**

### Minimum Score

Set a minimum score to reject low-quality releases:

- **0** — Accept anything
- **500** — Only decent quality
- **1000** — High quality only

---

## Condition Matching

### Text Matching

- **Contains** — Substring match (case-insensitive)
- **Equals** — Exact match
- **Regex** — Regular expression (advanced)

### Multiple Values

Add multiple values to a condition:

```
Codec: x265, HEVC, H.265
→ Matches any of these
```

### Negation

Use "Must Not Contain" for exclusions:

```
Must Not Contain:
  - Release Title: 3D
  - Release Title: HC (hardcoded subs)
```

---

## Best Practices

### Start Simple

Don't create 50 custom formats at once. Start with 2-3 important ones:

1. Prefer your favorite codec (x265)
2. Block unwanted formats (3D, CAM)
3. Prefer trusted groups

### Test Your Formats

Use the **Test** button to see if a format matches a release name:

```
Test String: Movie.Name.2024.1080p.BluRay.x265-Group
Format: x265 Preferred
Result: MATCH (+100 points)
```

### Avoid Over-Scoring

Don't make any single format worth 1000+ points:

- **Good**: x265 (+100), SPARKS (+200), HDR (+50)
- **Bad**: x265 (+5000) — overwhelms everything else

### Use Rejection Sparingly

Only reject truly unwanted content:

- **Reject**: CAM, TS, hardcoded subs in wrong language
- **Don't reject**: Just because you slightly prefer BluRay over WEB-DL

---

## Advanced: Regex Conditions

For complex matching, use regular expressions:

### Match Multiple Groups

```
Release Group matches regex: (SPARKS|RARBG|YIFY)
```

### Match Season Packs

```
Release Title matches regex: S\d{2}\.(?!E\d{2})
→ Matches S01. but not S01E01
```

### Match Specific Bitrates

```
Release Title matches regex: \d{3,4}kbps
→ Matches 1500kbps, 8000kbps, etc.
```

---

## Troubleshooting

### Format Not Matching

1. **Check case sensitivity** — Matching is case-insensitive by default
2. **Verify condition type** — "Release Title" vs "Release Group"
3. **Test with exact name** — Copy/paste from indexer results

### Wrong Releases Being Grabbed

1. **Check score calculation** — Higher score wins
2. **Verify minimum score** — May be too low
3. **Review format order** — Earlier formats apply first

### Too Many Rejections

1. **Reduce reject conditions** — Only block truly unwanted
2. **Check "Must Contain"** — All must match, not any
3. **Use "Should Contain"** — For optional preferences

---

## See Also

- [Quality Profiles](quality-profiles.md) — Built-in scoring profiles
- [Search & Download](search-and-download.md) — How releases are selected
