import type { MigrationDefinition } from '../migration-helpers.js';
import { migration_v002 } from './002-add-profile-tables.js';
import { migration_v003 } from './003-add-root-folders-read-only.js';
import { migration_v004 } from './004-fix-scoring-profile-references.js';
import { migration_v005 } from './005-add-root-folders-preserve-symlinks.js';
import { migration_v006 } from './006-add-nzb-streaming-tables.js';
import { migration_v007 } from './007-add-nzb-extraction-columns.js';
import { migration_v008 } from './008-fix-nzb-mounts-check-constraint.js';
import { migration_v009 } from './009-remove-quality-presets.js';
import { migration_v010 } from './010-flag-broken-series-metadata.js';
import { migration_v011 } from './011-add-download-client-temp-paths.js';
import { migration_v012 } from './012-add-media-browser-servers.js';
import { migration_v013 } from './013-remove-live-tv-v1.js';
import { migration_v014 } from './014-add-live-tv-external-api.js';
import { migration_v015 } from './015-remove-live-tv-epg-cache.js';
import { migration_v016 } from './016-add-live-tv-stream-health.js';
import { migration_v017 } from './017-add-live-tv-epg-xmltv.js';
import { migration_v018 } from './018-add-epg-performance-indexes.js';
import { migration_v019 } from './019-add-epg-search-indexes.js';
import { migration_v020 } from './020-add-daddyhd-provider.js';
import { migration_v021 } from './021-add-live-tv-cached-server.js';
import { migration_v022 } from './022-remove-live-tv-v2.js';
import { migration_v023 } from './023-add-stalker-accounts.js';
import { migration_v024 } from './024-add-stalker-channel-caching.js';
import { migration_v025 } from './025-add-channel-lineup-tables.js';
import { migration_v026 } from './026-add-epg-programs.js';
import { migration_v027 } from './027-add-channel-lineup-backups.js';
import { migration_v028 } from './028-drop-old-live-tv-settings.js';
import { migration_v029 } from './029-clean-break-live-tv.js';
import { migration_v030 } from './030-add-stalker-device-params.js';
import { migration_v031 } from './031-add-portal-scanner-tables.js';
import { migration_v032 } from './032-add-stalker-epg-tracking.js';
import { migration_v033 } from './033-add-epg-source-override.js';
import { migration_v034 } from './034-add-download-client-url-base.js';
import { migration_v035 } from './035-add-download-client-mount-mode.js';
import { migration_v036 } from './036-add-nzb-segment-cache.js';
import { migration_v037 } from './037-add-stream-url-type.js';
import { migration_v038 } from './038-add-alternate-titles.js';
import { migration_v039 } from './039-add-release-group-columns.js';
import { migration_v040 } from './040-add-captcha-solver-settings.js';
import { migration_v041 } from './041-add-root-folders-default-monitored.js';
import { migration_v042 } from './042-add-smart-list-external-source-support.js';
import { migration_v043 } from './043-add-smart-list-preset-fields.js';
import { migration_v044 } from './044-add-info-hash-to-file-tables.js';
import { migration_v045 } from './045-add-activities-table.js';
import { migration_v046 } from './046-add-activity-details-table.js';
import { migration_v047 } from './047-add-task-settings-table.js';
import { migration_v048 } from './048-dedupe-episode-files-and-add-unique-path-index.js';
import { migration_v049 } from './049-backfill-orphaned-download-history-to-removed.js';
import { migration_v050 } from './050-livetv-fresh-start-multiprovider.js';
import { migration_v051 } from './051-fix-lineup-foreign-keys.js';
import { migration_v052 } from './052-fix-epg-programs-schema.js';
import { migration_v053 } from './053-add-iptv-org-config-column.js';
import { migration_v054 } from './054-add-indexer-cookies-columns.js';
import { migration_v055 } from './055-add-download-client-health-columns.js';
import { migration_v056 } from './056-reserved-better-auth-refactor-v56.js';
import { migration_v057 } from './057-reserved-better-auth-refactor-v57.js';
import { migration_v058 } from './058-reserved-better-auth-refactor-v58.js';
import { migration_v059 } from './059-reserved-better-auth-refactor-v59.js';
import { migration_v060 } from './060-add-user-api-key-secrets-table.js';
import { migration_v061 } from './061-rename-live-tv-to-media-streaming-api-key.js';
import { migration_v062 } from './062-add-user-role-column.js';
import { migration_v063 } from './063-repair-better-auth-schema.js';
import { migration_v064 } from './064-ensure-bootstrap-user-is-admin.js';
import { migration_v065 } from './065-migrate-apikey-schema-v1-5.js';
import { migration_v066 } from './066-fix-apikey-schema-v1-5-stuck.js';
import { migration_v067 } from './067-add-rate-limit-id-column.js';
import { migration_v068 } from './068-add-edition-to-episode-files.js';
import { migration_v069 } from './069-add-download-history-indexes.js';
import { migration_v070 } from './070-drop-unused-activities-tables.js';
import { migration_v071 } from './071-add-download-queue-tombstones-table.js';
import { migration_v072 } from './072-add-adaptive-subtitle-searching-columns.js';
import { migration_v073 } from './073-allow-plex-media-browser-servers.js';
import { migration_v074 } from './074-consolidate-nzb-mount-clients-into-sab-mount-mode.js';
import { migration_v075 } from './075-add-language-column-to-user-table.js';
import { migration_v076 } from './076-add-root-folders-media-sub-type.js';
import { migration_v077 } from './077-add-libraries-table-and-media-links.js';
import { migration_v078 } from './078-backfill-existing-media-to-system-libraries.js';
import { migration_v079 } from './079-migrate-custom-format-audio-conditions.js';
import { migration_v080 } from './080-built-in-profile-score-overrides.js';
import { migration_v081 } from './081-unify-scoring-profile-architecture.js';
import { migration_v082 } from './082-add-media-server-stats-tables.js';
import { migration_v083 } from './083-add-movie-collection-columns.js';
import { migration_v084 } from './084-add-release-date-columns.js';

export const MIGRATIONS: MigrationDefinition[] = [
	migration_v002,
	migration_v003,
	migration_v004,
	migration_v005,
	migration_v006,
	migration_v007,
	migration_v008,
	migration_v009,
	migration_v010,
	migration_v011,
	migration_v012,
	migration_v013,
	migration_v014,
	migration_v015,
	migration_v016,
	migration_v017,
	migration_v018,
	migration_v019,
	migration_v020,
	migration_v021,
	migration_v022,
	migration_v023,
	migration_v024,
	migration_v025,
	migration_v026,
	migration_v027,
	migration_v028,
	migration_v029,
	migration_v030,
	migration_v031,
	migration_v032,
	migration_v033,
	migration_v034,
	migration_v035,
	migration_v036,
	migration_v037,
	migration_v038,
	migration_v039,
	migration_v040,
	migration_v041,
	migration_v042,
	migration_v043,
	migration_v044,
	migration_v045,
	migration_v046,
	migration_v047,
	migration_v048,
	migration_v049,
	migration_v050,
	migration_v051,
	migration_v052,
	migration_v053,
	migration_v054,
	migration_v055,
	migration_v056,
	migration_v057,
	migration_v058,
	migration_v059,
	migration_v060,
	migration_v061,
	migration_v062,
	migration_v063,
	migration_v064,
	migration_v065,
	migration_v066,
	migration_v067,
	migration_v068,
	migration_v069,
	migration_v070,
	migration_v071,
	migration_v072,
	migration_v073,
	migration_v074,
	migration_v075,
	migration_v076,
	migration_v077,
	migration_v078,
	migration_v079,
	migration_v080,
	migration_v081,
	migration_v082,
	migration_v083,
	migration_v084
];
