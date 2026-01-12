# Download Clients

Cinephage supports four download clients for grabbing releases from indexers.

---

## Supported Clients

| Client      | Protocol | Description                        |
| ----------- | -------- | ---------------------------------- |
| qBittorrent | Torrent  | Popular open-source torrent client |
| SABnzbd     | Usenet   | Python-based usenet downloader     |
| NZBGet      | Usenet   | Efficient C++ usenet downloader    |
| NZB-Mount   | Usenet   | SABnzbd-compatible NZB mount API   |

---

## qBittorrent Setup

qBittorrent is recommended for torrent downloads.

### Enable WebUI

1. Open qBittorrent
2. Go to **Tools > Options > Web UI**
3. Enable **Web User Interface (Remote control)**
4. Set a **username** and **password**
5. Note the **port** (default: 8080)
6. Click **Apply**

### Optional: Localhost Bypass

If Cinephage runs on the same machine as qBittorrent:

1. In qBittorrent Web UI settings
2. Enable **Bypass authentication for clients on localhost**
3. No username/password needed in Cinephage

### Add to Cinephage

1. Navigate to **Settings > Integrations > Download Clients**
2. Click **Add Download Client**
3. Select **qBittorrent**
4. Configure:

| Setting  | Value                                    |
| -------- | ---------------------------------------- |
| Name     | qBittorrent (or custom name)             |
| Host     | `localhost` or IP address                |
| Port     | `8080` (or your configured port)         |
| Username | Your WebUI username                      |
| Password | Your WebUI password                      |
| Category | `cinephage` (optional, for organization) |

5. Click **Test Connection**
6. Save

### Recommended qBittorrent Settings

For best compatibility:

- **Downloads > When adding a torrent > Add in paused state**: Disabled
- **Downloads > Saving Management > Default Torrent Management Mode**: Automatic
- **Connection > Listening Port**: Configured for your network
- **BitTorrent > Seeding Limits**: Configure based on your preferences

---

## SABnzbd Setup

SABnzbd is recommended for usenet downloads.

### Get API Key

1. Open SABnzbd web interface
2. Go to **Config > General**
3. Find **API Key** section
4. Copy the API key

### Add to Cinephage

1. Navigate to **Settings > Integrations > Download Clients**
2. Click **Add Download Client**
3. Select **SABnzbd**
4. Configure:

| Setting  | Value                            |
| -------- | -------------------------------- |
| Name     | SABnzbd (or custom name)         |
| Host     | `localhost` or IP address        |
| Port     | `8080` (or your configured port) |
| API Key  | Your SABnzbd API key             |
| Category | `cinephage` (optional)           |

5. Click **Test Connection**
6. Save

### SABnzbd Path Mapping Best Practices

For best compatibility with Cinephage imports:

- Set the **Completed Download Folder** and **Temporary Download Folder** client paths in Cinephage to match the exact paths configured in **SABnzbd > Config > Folders**.
- In **SABnzbd > Config > Categories**, map each category to the intended output subfolder (for example, `movies` and `tv`) so the completed path matches your Cinephage category names.

#### Example

SABnzbd settings:

- **Completed Download Folder:** `/downloads/complete`
- **Temporary Download Folder:** `/downloads/incomplete`
- **Categories:**
  - `movies` -> `movies`
  - `tv` -> `tv`

Cinephage path mapping:

| Folder Type | Client Path             | Local Path                |
| ----------- | ----------------------- | ------------------------- |
| Completed   | `/downloads/complete`   | `/mnt/sabnzbd/complete`   |
| Temporary   | `/downloads/incomplete` | `/mnt/sabnzbd/incomplete` |

### SABnzbd Category Setup

Create a category for Cinephage downloads:

1. In SABnzbd, go to **Config > Categories**
2. Add a new category named `cinephage`
3. Set the output folder path
4. Save

---

## NZB-Mount Setup

NZB-Mount is a SABnzbd-compatible API for NZB mounts (NZBDav/Altmount). It exposes a completed path that Cinephage imports from (typically `.strm` files or symlinked media).

### Get API Key

1. Open your NZB-Mount web interface
2. Locate the API key for SABnzbd compatibility

### Add to Cinephage

1. Navigate to **Settings > Integrations > Download Clients**
2. Click **Add Download Client**
3. Select **NZB-Mount**
4. Configure:

| Setting     | Value                            |
| ----------- | -------------------------------- |
| Name        | NZB-Mount (or custom name)       |
| Host        | `localhost` or IP address        |
| Port        | `3000` (or your configured port) |
| API Key     | Your NZB-Mount API key           |
| API Variant | NZBDav or Altmount               |
| Category    | `cinephage` (optional)           |

5. Click **Test Connection**
6. Save

### Altmount Symlink Path Mapping

When using **Altmount** with the import strategy set to **symlinks**, map the **Client Path** to the symlink base directory rather than the completed folder. This ensures Cinephage resolves the symlinked content correctly.

Example:

- Altmount **Complete directory**: `/complete`
- Altmount **Symlink import directory**: `/symlinks`
- rclone mount path: `/mnt/altmountrem`
- Cinephage path mapping:

| Client Path | Local Path         |
| ----------- | ------------------ |
| `/symlinks` | `/mnt/altmountrem` |

Also enable **Preserve symlinks (for NZBDav/rclone mounts)** on the destination root folder in **Settings > General**, so Cinephage recreates symlinks in the media folder instead of copying the target file. This applies to both NZBDav and Altmount when using the symlink import strategy.

Best practice: avoid using the same directory name for both the symlink import directory and the complete directory to prevent duplicate path segments during import.

### Altmount STRM Import Path Mapping

When using **Altmount** with the import strategy set to **STRM files**, avoid writing STRM files directly to a root folder. Due to how Altmount reports completed paths, place STRM files under a subfolder and map the base mount path in Cinephage.

Example:

- Altmount mount: `/mnt/altmount:/altmount/complete`
- Altmount **STRM directory**: `/altmount/complete`
- Altmount **Complete directory**: `/complete`
- Cinephage path mapping:

| Client Path          | Local Path      |
| -------------------- | --------------- |
| `/altmount/complete` | `/mnt/altmount` |

Warning: rclone must be disabled in Altmount when using the STRM import strategy.

---

## NZBGet Setup

NZBGet is an alternative usenet client.

### Get Credentials

1. Open NZBGet web interface
2. Go to **Settings > Security**
3. Note the username and password (ControlUsername/ControlPassword)

### Add to Cinephage

1. Navigate to **Settings > Integrations > Download Clients**
2. Click **Add Download Client**
3. Select **NZBGet**
4. Configure:

| Setting  | Value                        |
| -------- | ---------------------------- |
| Name     | NZBGet (or custom name)      |
| Host     | `localhost` or IP address    |
| Port     | `6789` (default NZBGet port) |
| Username | Your NZBGet username         |
| Password | Your NZBGet password         |
| Category | `cinephage` (optional)       |

5. Click **Test Connection**
6. Save

---

## Path Mapping

When your download client and Cinephage see files at different paths, configure path mappings.

### Common Scenarios

| Scenario        | Download Client Path | Cinephage Path     |
| --------------- | -------------------- | ------------------ |
| Docker          | `/downloads`         | `/media/downloads` |
| Network share   | `\\server\downloads` | `/mnt/downloads`   |
| Different mount | `/volume1/downloads` | `/data/downloads`  |

### Configuring Mappings

1. Go to your download client settings in Cinephage
2. Find the **Path Mapping** section
3. Add mappings:
   - **Remote Path**: Path as seen by download client
   - **Local Path**: Path as seen by Cinephage
4. Save

### Important for NZB-Mount and SABnzbd

If the client reports a completed path that already includes a category subfolder (e.g., `/completed-downloads/movies`), make sure the **Client Path** in Cinephage matches the full path reported by the client. This prevents duplicated path segments during import.

### Example

If NZB-Mount or SABnzbd reports `/completed-downloads/movies` but Cinephage sees `/mnt/nzbdav/completed-downloads/movies`:

| Remote Path                   | Local Path                               |
| ----------------------------- | ---------------------------------------- |
| `/completed-downloads/movies` | `/mnt/nzbdav/completed-downloads/movies` |

---

## Multiple Clients

You can configure multiple download clients:

- Multiple torrent clients (e.g., qBittorrent for movies, another for TV)
- Multiple usenet clients
- Mix of torrent and usenet

### Priority

When multiple clients are configured, releases are sent based on:

1. Protocol match (torrent releases to torrent clients)
2. Client priority order
3. Client availability

---

## Troubleshooting

### Connection Failed

1. Verify host and port are correct
2. Check client is running and WebUI is enabled
3. Verify firewall allows connection
4. Check username/password

### Downloads Not Starting

1. Verify the download client is not paused
2. Check client disk space
3. Verify torrent/NZB was received (check client directly)
4. Check Cinephage logs for errors

### Imports Not Working

1. Verify path mappings are correct
2. Check file permissions
3. Ensure root folder is accessible
4. Check import settings in Cinephage

---

**See also:** [Setup Wizard](../getting-started/setup-wizard.md) | [Indexers](indexers.md) | [Troubleshooting](../support/troubleshooting.md)
