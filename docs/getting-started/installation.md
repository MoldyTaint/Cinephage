[< Back to Index](../INDEX.md) | [Next: Configuration](configuration.md)

# Installation

This guide covers prerequisites and installation steps for Cinephage.

---

## Requirements

### Required

| Component   | Minimum Version | Notes                                |
|-------------|-----------------|--------------------------------------|
| Node.js     | 20+             | LTS version recommended              |
| npm         | 10+             | Comes with Node.js                   |
| qBittorrent | 4.5+            | WebUI must be enabled                |
| TMDB API    | -               | Free key from themoviedb.org         |

### Optional

| Component | Purpose                                         |
|-----------|-------------------------------------------------|
| ffprobe   | Media info extraction (resolution, codecs, etc.)|

---

## System Requirements

### Minimum

| Resource   | Minimum          |
|------------|------------------|
| RAM        | 512 MB           |
| Disk Space | 100 MB + library |
| CPU        | 1 core           |

### Recommended

| Resource   | Recommended      |
|------------|------------------|
| RAM        | 1 GB             |
| Disk Space | 500 MB + library |
| CPU        | 2+ cores         |

---

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Application

```bash
npm run build
```

### 4. Start the Server

```bash
npm start
```

The application will be available at http://localhost:3000.

> **Note**: The database initializes automatically on first run at `data/cinephage.db`.

---

## Installing ffprobe (Optional)

ffprobe provides media info extraction for resolution, codec, and audio track details.

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

If ffprobe is not in your system PATH, set the `FFPROBE_PATH` environment variable.

---

## Next Steps

After installation, continue to [Configuration](configuration.md) for first-run setup.

---

**See also:** [Configuration](configuration.md) | [Environment Variables](../reference/environment-variables.md) | [Production Deployment](../deployment/production.md)
