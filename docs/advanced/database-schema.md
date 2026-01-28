# Database Schema Reference

Complete reference for Cinephage's SQLite database schema.

## Overview

Cinephage uses SQLite with the better-sqlite3 driver. The database is self-contained in a single file at `data/cinephage.db`.

## Core Tables

### User & Settings

**user** - System user account

- id, username, password_hash, created_at, updated_at

**settings** - Application configuration

- id, key, value (JSON), updated_at

## Media Library

**movies** - Movie metadata

- id, tmdb_id, imdb_id, title, overview, release_date, runtime
- monitored, profile_id, root_folder_id, tags

**movie_files** - Physical movie files

- id, movie_id, path, size, quality, media_info

**series** - TV series metadata

- id, tvdb_id, tmdb_id, title, status, monitored

**seasons** - TV seasons

- id, series_id, season_number, monitored

**episodes** - Individual episodes

- id, series_id, season_id, episode_number, title, air_date

**episode_files** - Physical episode files

- id, episode_id, path, size, quality, media_info

## Downloads

**download_clients** - Client configuration

- id, name, implementation, settings (JSON)

**download_queue** - Active downloads

- id, movie_id, episode_id, status, protocol

**download_history** - Completed downloads

- id, event_type, date, data (JSON)

## Quality & Scoring

**scoring_profiles** - Quality profiles

- id, name, type, cutoff, items (JSON)

**custom_formats** - User format rules

- id, name, specifications (JSON)

## Monitoring

**monitoring_settings** - Global config

- id, search*on_monitor_enabled, interval*\* settings

**delay_profiles** - Release delays

- id, name, usenet_delay, torrent_delay, bypass settings

**pending_releases** - Delayed releases queue

- id, movie_id, protocol, delay_until

**blocklist** - Blocked releases

- id, movie_id, title, protocol, message

## Database Maintenance

### Backup

```bash
sqlite3 data/cinephage.db ".backup to backup/cinephage.db"
```

### Integrity Check

```bash
sqlite3 data/cinephage.db "PRAGMA integrity_check;"
```

### Optimize

```bash
sqlite3 data/cinephage.db "VACUUM;"
```
