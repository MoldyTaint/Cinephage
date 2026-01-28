# Usenet Streaming (NZB Streaming)

Cinephage can stream content directly from usenet without downloading the entire file first. This is achieved through **NZB Streaming** — a powerful feature for usenet users who want instant playback.

---

## What is NZB Streaming?

Traditional workflow:

1. Download NZB to client (SABnzbd/NZBGet)
2. Wait for full download
3. Import to library
4. Play file

**NZB Streaming workflow:**

1. Mount NZB as virtual filesystem
2. Stream segments on-demand
3. Play immediately — no waiting
4. Optional: Keep cache for re-watching

---

## How It Works

### The Technology

NZB Streaming uses several components:

- **NNTP Connections** — Direct usenet server connections
- **Segment Caching** — Downloaded pieces stored temporarily
- **RAR Extraction** — On-the-fly decompression
- **FFmpeg Probing** — Media info without full download
- **HTTP Streaming** — Standard video streaming protocols

### Architecture

```
Player Request
    ↓
Cinephage Streaming Server
    ↓
NZB Mount (Virtual Filesystem)
    ↓
Segment Cache (Downloaded pieces)
    ↓
NNTP Server (Usenet provider)
```

---

## Requirements

### Usenet Provider

You need a usenet provider that supports:

- **Standard NNTP** — Port 563 (SSL) or 119 (non-SSL)
- **Long retention** — 1000+ days recommended
- **No download limits** — Streaming uses bandwidth

### NZB-Mount Client

Configure NZBMount as a download client:

1. **Settings > Download Clients > Add**
2. **Type**: NZBMount
3. **Name**: Streaming Mount
4. **Save** — No other config needed

### NNTP Server Configuration

Add your usenet provider:

1. **Settings > Integrations > NNTP Servers**
2. **Add Server**:
   - **Host**: Your provider's address
   - **Port**: 563 (SSL) or 119
   - **Username/Password**: Your credentials
   - **Connections**: 8-16 (more = faster)
   - **SSL**: Enabled (recommended)

---

## Using NZB Streaming

### Method 1: Stream Mode (Recommended)

Set quality profile to "Streamer":

1. **Settings > Quality > Quality Profiles**
2. Select "Streamer" profile
3. Assign to movies/series

This creates `.strm` files that stream directly.

### Method 2: Manual Stream

From search results:

1. Search for content
2. Find NZB release
3. Click **Stream** instead of **Download**
4. Choose quality (if multiple streams available)

### Method 3: NZB-Mount Import

For existing NZBs:

1. Add NZB to NZBMount client
2. Cinephage mounts it automatically
3. Stream via `.strm` file or direct URL

---

## Stream Quality

### Adaptive Streaming

Cinephage probes the NZB to determine:

- **Available qualities** — 480p, 720p, 1080p, 4K
- **Audio tracks** — Stereo, 5.1, 7.1
- **Subtitles** — Embedded or external

### Quality Selection

Choose quality based on your needs:

| Quality | Bandwidth | Use Case                |
| ------- | --------- | ----------------------- |
| 480p    | 2-4 Mbps  | Mobile, slow connection |
| 720p    | 4-8 Mbps  | Standard streaming      |
| 1080p   | 8-15 Mbps | HD quality              |
| 4K      | 25+ Mbps  | Best quality            |

### Automatic Quality

Enable adaptive quality:

```
Settings > Streaming > Adaptive Quality: ON
```

Adjusts based on your connection speed.

---

## Segment Caching

### How Caching Works

NZBs are split into segments (usually 500KB-1MB each):

- **First request** — Downloads segments from usenet
- **Cache storage** — Saved to disk temporarily
- **Subsequent requests** — Served from cache
- **Auto-cleanup** — Old segments deleted automatically

### Cache Settings

Configure in **Settings > Integrations > NNTP Servers**:

| Setting        | Description                  | Default  |
| -------------- | ---------------------------- | -------- |
| **Cache Size** | Max disk space for cache     | 10 GB    |
| **Cache TTL**  | How long to keep segments    | 24 hours |
| **Prefetch**   | Download next segments early | Enabled  |

### Cache Location

```
Default: data/nzb_cache/
Docker: /app/data/nzb_cache/
```

---

## Performance Optimization

### Connection Tuning

More connections = faster streaming:

```
NNTP Connections: 16-32
→ Better for high-bandwidth providers
→ More parallel segment downloads
```

But watch your provider's connection limits!

### Segment Prefetching

Enable prefetch for smoother playback:

```
Prefetch: Enabled
Prefetch Ahead: 5 segments
```

Downloads upcoming segments before they're needed.

### Provider Selection

Use a provider with:

- **Fast speeds** — 50+ Mbps recommended
- **Low latency** — <50ms to server
- **High completion** — 99%+ article availability

---

## Troubleshooting

### Stream Won't Start

1. **Check NNTP server** — Verify credentials work
2. **Check connections** — May be at provider limit
3. **Check NZB health** — Articles may be missing
4. **Check cache** — Disk space available?

### Buffering/Stuttering

1. **Lower quality** — Try 720p instead of 1080p
2. **Increase connections** — More parallel downloads
3. **Check bandwidth** — Usenet + streaming may saturate connection
4. **Enable prefetch** — Download ahead of playback

### "Article Not Found" Errors

Some segments are missing:

1. **Check completion** — Provider may not have all parts
2. **Try different NZB** — Same release, different upload
3. **Enable repair** — PAR2 repair of missing segments
4. **Use backup provider** — Configure multiple NNTP servers

### High Memory Usage

Streaming can use memory:

1. **Reduce cache size** — Lower segment cache limit
2. **Reduce connections** — Fewer parallel downloads
3. **Disable prefetch** — Less aggressive caching
4. **Monitor patterns** — Specific NZBs causing issues?

---

## Advanced Features

### Multiple NNTP Servers

Configure backup providers:

1. **Settings > Integrations > NNTP Servers**
2. Add primary provider
3. Add backup provider(s)
4. Set priority order

If primary fails, automatically uses backup.

### PAR2 Repair

Enable automatic repair:

```
Settings > Integrations > NNTP Servers > Enable PAR2: ON
```

Repairs missing segments using parity files.

### Stream Extraction Cache

Stream URLs are cached to avoid re-extraction:

- **Cache duration**: 1 hour default
- **Auto-refresh**: Before expiration
- **Manual refresh**: Click "Refresh Stream"

---

## Comparison: Download vs Stream

| Aspect           | Download         | Stream                 |
| ---------------- | ---------------- | ---------------------- |
| **Startup Time** | Minutes to hours | Seconds                |
| **Disk Usage**   | Full file size   | Cache only (~10GB max) |
| **Bandwidth**    | Download once    | Stream every time      |
| **Quality**      | Full quality     | Adjustable             |
| **Rewatching**   | Instant (local)  | Re-stream (bandwidth)  |
| **Best For**     | Keep forever     | Watch once             |

---

## Security Considerations

### SSL/TLS

Always use SSL for NNTP connections:

```
Port: 563 (not 119)
SSL: Enabled
```

Prevents ISP from seeing what you're downloading.

### VPN Compatibility

NZB streaming works with VPNs:

- **Configure VPN** — On Cinephage host or network
- **Provider sees** — VPN IP, not your real IP
- **May impact speed** — VPN overhead

---

## See Also

- [Download Clients](download-clients.md) — NZBMount configuration
- [Streaming](streaming.md) — General streaming features
- [Quality Profiles](quality-profiles.md) — Streamer profile
