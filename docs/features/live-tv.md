# Live TV

Cinephage includes IPTV support with multi-provider integration, supporting Stalker Portals, XStream Codes, and M3U playlists.

> **Feature Status**: Live TV functionality supports three provider types. Stalker Portal is the most mature, with XStream and M3U support recently added.

---

## Overview

Cinephage supports live TV through three provider types:

| Provider           | Type          | Authentication    | Best For                                    |
| ------------------ | ------------- | ----------------- | ------------------------------------------- |
| **Stalker Portal** | MAG/Ministra  | MAC Address       | Providers using Stalker/Ministra middleware |
| **XStream Codes**  | IPTV API      | Username/Password | Providers using XStream Codes panel         |
| **M3U Playlist**   | Playlist File | None              | Generic IPTV playlists                      |

You have multiple options for adding accounts:

- **Add manually** — Configure any of the three provider types directly
- **Discover Stalker accounts** — Use the built-in portal scanner to find working MAC addresses on Stalker portals

Once accounts are configured, you get:

- Channel sync from providers
- Electronic Program Guide (EPG) support (Stalker fully implemented, XStream planned)
- Channel lineup organization
- M3U playlist generation for external players
- Category management

---

## Provider Types

### Stalker Portal

Stalker (also known as Ministra) is an IPTV middleware system used by many IPTV providers. Your provider gives you a portal URL and MAC address.

**Required Fields:**

- **Name** — Display name for the account
- **Portal URL** — The portal URL (e.g., `http://portal.example.com/c`)
- **MAC Address** — Format: `00:1A:79:XX:XX:XX`

**Features:**

- ✅ Full EPG support
- ✅ Archive/Catch-up TV
- ✅ Portal scanning for discovery
- ✅ Account expiration tracking

### XStream Codes

XStream Codes is a popular IPTV panel system. Accounts use username/password authentication.

**Required Fields:**

- **Name** — Display name for the account
- **Server URL** — The XStream server URL (e.g., `http://example.com:8080`)
- **Username** — Your XStream username
- **Password** — Your XStream password

**Features:**

- ✅ Username/password authentication
- ✅ Account expiration tracking
- ⚠️ EPG support planned
- ⚠️ Archive support implemented but untested

### M3U Playlist

M3U playlists are standard IPTV playlist files that contain channel URLs.

**Required Fields:**

- **Name** — Display name for the playlist
- **URL** or **File** — Either a URL to an M3U file or upload the file directly

**Optional Fields:**

- **EPG URL** — XMLTV EPG URL for program guide data
- **Auto-refresh** — Automatically refresh the playlist periodically (URL only)

**Features:**

- ✅ URL or file upload
- ✅ Optional EPG via XMLTV URL
- ✅ Auto-refresh support
- ❌ No authentication required
- ❌ No archive/catch-up support

---

## Adding an Account

1. Navigate to **Live TV > Accounts**
2. Click **Add Account**
3. Select your provider type (Stalker, XStream, or M3U)
4. Fill in the required fields
5. Click **Test** to verify the connection
6. Save the account

### Testing Connections

Always test your account before saving:

- **Stalker**: Verifies MAC address and retrieves account profile
- **XStream**: Authenticates and retrieves user info
- **M3U**: Parses the playlist and counts channels

---

## Discovering Stalker Accounts

If you have a Stalker portal but don't have valid credentials, Cinephage can scan for working MAC addresses.

### How It Works

The scanner tests MAC addresses against a portal to find valid credentials. When a valid MAC is found, the scanner retrieves account details.

### Scan Types

| Type           | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| **Random**     | Generates random MAC addresses using known STB manufacturer prefixes |
| **Sequential** | Tests a specific range of MAC addresses                              |
| **Import**     | Tests a list of MAC addresses you provide                            |

### Scanning Process

1. Click **Scan for Accounts** (only shown when you have Stalker accounts)
2. Select or create a portal to scan
3. Choose scan type and configure options
4. Start the scan — progress displays in real-time
5. Review discovered accounts
6. Approve accounts you want to use

---

## Channel Sync

After adding an account, sync channels:

1. Go to your account settings
2. Click **Sync Channels**
3. Cinephage fetches the channel list from the provider
4. Channels appear in the channel management interface

### What Gets Synced

- Channel names and numbers
- Categories/groups
- Stream URLs
- Channel logos (if available)
- EPG channel IDs

---

## Channel Lineup

The channel lineup determines which channels are active and how they're organized.

### Managing Channels

1. Navigate to **Live TV > Channels**
2. View all synced channels from all providers
3. Toggle channels on/off
4. Reorder channels
5. Assign to categories

### Creating a Lineup

1. Go to **Live TV > Lineup**
2. Click **Create Lineup**
3. Select channels to include (from any provider)
4. Arrange order
5. Save

### Multiple Lineups

Create different lineups for different purposes:

- **All Channels** — Everything available
- **Sports Only** — Just sports channels
- **News** — News channels only
- **Family** — Family-friendly content

---

## Categories

Organize channels into categories:

### Default Categories

- Movies
- Sports
- News
- Entertainment
- Kids
- Music

### Custom Categories

1. Go to **Live TV > Categories**
2. Click **Add Category**
3. Name the category
4. Assign channels from any provider

---

## Electronic Program Guide (EPG)

EPG provides TV schedule information.

### EPG Sources by Provider

| Provider    | EPG Support | Notes                 |
| ----------- | ----------- | --------------------- |
| **Stalker** | ✅ Full     | Retrieved from portal |
| **XStream** | ⚠️ Planned  | Via XStream EPG API   |
| **M3U**     | ✅ Optional | Requires XMLTV URL    |

### Configuring EPG

**For Stalker:**

1. EPG is automatically fetched from the portal
2. Configure sync interval in settings

**For M3U:**

1. When creating/editing the account, add an EPG URL
2. The EPG should be in XMLTV format
3. Cinephage will fetch and parse the EPG data

### EPG Refresh

- Default interval: 6 hours
- Manual refresh available
- EPG data cached locally

---

## M3U Playlist Export

Cinephage generates M3U playlists for external players.

### Accessing the Playlist

The M3U playlist is available at:

```
http://your-cinephage-url/api/livetv/playlist.m3u
```

### Using with External Apps

Point any M3U-compatible player to this URL:

- VLC
- IPTV apps
- Smart TV apps
- Kodi
- Jellyfin/Emby/Plex

### Playlist Contents

The M3U includes:

- Active channels from your lineup
- Stream URLs (resolved from any provider type)
- Channel names and numbers
- EPG mapping (if configured)
- Category tags (group-title)

---

## Stream Playback

### Direct Play

Click any channel in the Live TV interface to play directly.

### Via Media Server

Import the M3U playlist into Jellyfin/Emby/Plex for integrated live TV.

### Failover

If you have multiple accounts with the same channels, Cinephage can automatically failover to backup sources if the primary stream fails.

---

## Known Limitations

### By Provider Type

**Stalker:**

- Some portals may have different API versions
- Stream URL formats vary by portal configuration

**XStream:**

- EPG not yet implemented (planned)
- Archive/catch-up not yet tested

**M3U:**

- No built-in EPG (requires external XMLTV URL)
- No authentication support
- No archive/catch-up support

### General

- DVR/recording not supported yet
- Some streams may require specific player support
- EPG mapping can be imperfect across providers

---

## Troubleshooting

### Channels Not Loading

**Stalker:**

1. Verify portal URL is correct
2. Check MAC address format (XX:XX:XX:XX:XX:XX)
3. Ensure portal is online
4. Check Cinephage logs for errors

**XStream:**

1. Verify server URL includes port if needed
2. Check username/password
3. Ensure account is active

**M3U:**

1. Verify URL is accessible
2. Check file format is valid M3U/M3U8
3. Ensure URLs in playlist are valid

### Streams Not Playing

- Some streams require specific player support
- Check if stream format is compatible (HLS, DASH, etc.)
- Try playing in VLC directly
- Check if stream URL requires specific headers

### EPG Not Showing

1. Verify EPG source URL is accessible (for M3U)
2. Check channel-to-EPG mapping
3. Wait for next EPG refresh
4. Check EPG source format is XMLTV compatible
5. Verify EPG times match your timezone

### Account Test Fails

1. Check network connectivity
2. Verify credentials
3. Check if provider requires specific headers
4. Look at browser console for error details

---

## Migration Notes

If you previously used Stalker-only mode:

- All existing Stalker accounts are preserved
- The UI now shows all provider types
- You can add XStream and M3U accounts alongside Stalker accounts
- Channel lineups can mix channels from all providers

---

**See also:** [Streaming](streaming.md) | [Notifications](notifications.md) | [Troubleshooting](../support/troubleshooting.md)
