# Captcha Solver

Cinephage includes a built-in **Captcha Solver** that automatically handles Cloudflare challenges and other anti-bot protections. No external services like FlareSolverr required.

---

## How It Works

The Captcha Solver uses **Camoufox** — a privacy-focused Firefox fork with anti-detection features:

1. **Challenge Detection** — Automatically detects Cloudflare/Turnstile challenges
2. **Browser Automation** — Launches headless browser to solve challenges
3. **Cookie Caching** — Stores successful cookies to minimize solves
4. **Health Monitoring** — Tracks success rates and adjusts automatically

---

## Configuration

Navigate to **Settings > Integrations > Captcha Solver**:

### Basic Settings

| Setting       | Description                          | Default |
| ------------- | ------------------------------------ | ------- |
| **Enabled**   | Turn solver on/off                   | Enabled |
| **Timeout**   | Max time to wait for solve (seconds) | 60      |
| **Cache TTL** | How long to keep cookies (hours)     | 24      |
| **Headless**  | Run browser without GUI              | Enabled |

### Advanced Settings

| Setting             | Description                       | Default |
| ------------------- | --------------------------------- | ------- |
| **Proxy**           | HTTP proxy for browser (optional) | None    |
| **Max Retries**     | Retry attempts per challenge      | 3       |
| **Parallel Solves** | Concurrent challenge solving      | 1       |

---

## Cookie Management

Cookies are cached per-domain to minimize repeated challenges:

- **Automatic refresh** — Cookies refreshed before expiration
- **Per-domain storage** — Each indexer has isolated cookies
- **Manual clearing** — Clear cookies if issues occur

### Clearing Cookies

```bash
# Clear all cached cookies
# Via UI: Settings > Integrations > Captcha Solver > Clear Cache
```

---

## Health Monitoring

The solver tracks its own performance:

| Metric                 | Description                          |
| ---------------------- | ------------------------------------ |
| **Success Rate**       | Percentage of successful solves      |
| **Average Solve Time** | How long challenges take             |
| **Cached Domains**     | Number of domains with valid cookies |
| **Last Error**         | Most recent failure reason           |

---

## Troubleshooting

### Challenges Not Being Solved

1. **Check solver is enabled** — Settings > Integrations > Captcha Solver
2. **Increase timeout** — Some challenges take 30+ seconds
3. **Check logs** — Look for "captcha" or "camoufox" errors
4. **Clear cookie cache** — Corrupted cookies can cause failures

### High Failure Rate

1. **Disable headless mode** — Temporarily to debug (requires display)
2. **Check proxy settings** — If using proxy, verify it works
3. **Update Camoufox** — Solver uses latest browser version automatically

### Indexer Still Blocked

Not all protection is Cloudflare:

- **DataDome** — Currently not supported
- **PerimeterX** — May work, not guaranteed
- **Custom challenges** — Varies by site

Try alternative indexers if one is consistently blocked.

---

## Performance Impact

- **Memory**: ~200MB per browser instance
- **CPU**: Minimal when idle, spikes during solves
- **Disk**: Cookies cached in database (~1KB per domain)

---

## See Also

- [Indexers](indexers.md) — Configuring indexers that need Cloudflare bypass
- [Troubleshooting](../support/troubleshooting.md) — General troubleshooting guide
