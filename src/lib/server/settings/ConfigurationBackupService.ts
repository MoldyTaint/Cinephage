import type { AnySQLiteColumn, AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { getTableColumns } from 'drizzle-orm';

import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';
import {
	decryptBackupPayload,
	encryptBackupPayload,
	type EncryptedBackupPayload
} from '$lib/server/crypto/backupCrypto.js';
import { decryptDebridToken, encryptDebridToken } from '$lib/server/crypto/debridTokenCrypto.js';
import { db } from '$lib/server/db';
import { getCookieStore } from '$lib/server/indexers/auth/CookieStore.js';
import {
	archivers,
	captchaSolverSettings,
	channelCategories,
	channelLineupBackups,
	channelLineupItems,
	customFormats,
	delayProfiles,
	downloadClients,
	indexers,
	languageProfiles,
	libraries,
	libraryRootFolders,
	librarySettings,
	livetvAccounts,
	mediaBrowserServers,
	monitoringSettings,
	namingPresets,
	namingSettings,
	nntpServers,
	rootFolders,
	scoringProfiles,
	settings,
	smartLists,
	stalkerPortals,
	subtitleProviders,
	subtitleSettings,
	taskSettings,
	indexerStatus
} from '$lib/server/db/schema';

export interface ConfigurationBackupFile {
	format: 'cinephage-config-backup';
	version: 1;
	createdAt: string;
	manifest?: ConfigurationBackupManifest;
	options?: {
		includeIndexerCookies?: boolean;
	};
	data: Record<string, unknown[]>;
	secrets: EncryptedBackupPayload;
}

type TableName =
	| 'settings'
	| 'monitoringSettings'
	| 'captchaSolverSettings'
	| 'taskSettings'
	| 'scoringProfiles'
	| 'customFormats'
	| 'downloadClients'
	| 'rootFolders'
	| 'libraries'
	| 'libraryRootFolders'
	| 'librarySettings'
	| 'namingSettings'
	| 'namingPresets'
	| 'delayProfiles'
	| 'languageProfiles'
	| 'subtitleProviders'
	| 'subtitleSettings'
	| 'indexers'
	| 'nntpServers'
	| 'archivers'
	| 'mediaBrowserServers'
	| 'stalkerPortals'
	| 'livetvAccounts'
	| 'channelCategories'
	| 'channelLineupItems'
	| 'channelLineupBackups'
	| 'smartLists';

export type BackupSectionName =
	'system' | 'profiles' | 'downloads' | 'indexers' | 'subtitles' | 'integrations' | 'liveTv';

export interface ConfigurationBackupSectionManifest {
	id: BackupSectionName;
	label: string;
	tableNames: string[];
	totalRows: number;
}

export interface ConfigurationBackupManifest {
	sectionOrder: BackupSectionName[];
	sections: ConfigurationBackupSectionManifest[];
	totalTables: number;
	totalRows: number;
	supportsRestoreModes: Array<'apply'>;
}

export interface RestoreConfigOptions {
	passphrase: string;
	sections?: BackupSectionName[];
	mode?: 'apply' | 'replace';
}

export interface RestoreConfigResult {
	restoredSections: BackupSectionName[];
	restoredTables: TableName[];
	secretsRestored: boolean;
	warnings: string[];
}

interface BackupSecretPayload {
	tables: Record<string, Record<string, unknown>>;
	indexerCookies?: Record<
		string,
		{
			cookies: Record<string, string>;
			expiry: string;
		}
	>;
}

interface ExportConfigOptions {
	includeIndexerCookies?: boolean;
}

interface PreparedRestoreTable {
	config: TableBackupConfig;
	rows: Record<string, unknown>[];
}

interface TableBackupConfig {
	name: TableName;
	table: AnySQLiteTable;
	getRecordKey: (row: Record<string, unknown>) => string;
	conflictTarget: AnySQLiteColumn | AnySQLiteColumn[];
}

const BACKUP_VERSION = 1 as const;
const BACKUP_FORMAT = 'cinephage-config-backup' as const;

const SECRET_KEY_NAMES = new Set([
	'api_key',
	'apikey',
	'password',
	'username',
	'token',
	'auth_token',
	'authtoken',
	'secret',
	'cookie',
	'cookies',
	'proxy_username',
	'proxy_password',
	'headers',
	'api_token',
	'apitoken'
]);

const TABLES: TableBackupConfig[] = [
	{
		name: 'settings',
		table: settings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: settings.key
	},
	{
		name: 'monitoringSettings',
		table: monitoringSettings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: monitoringSettings.key
	},
	{
		name: 'captchaSolverSettings',
		table: captchaSolverSettings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: captchaSolverSettings.key
	},
	{
		name: 'taskSettings',
		table: taskSettings,
		getRecordKey: (row) => String(row.id),
		conflictTarget: taskSettings.id
	},
	{
		name: 'scoringProfiles',
		table: scoringProfiles,
		getRecordKey: (row) => String(row.id),
		conflictTarget: scoringProfiles.id
	},
	{
		name: 'customFormats',
		table: customFormats,
		getRecordKey: (row) => String(row.id),
		conflictTarget: customFormats.id
	},
	{
		name: 'downloadClients',
		table: downloadClients,
		getRecordKey: (row) => String(row.id),
		conflictTarget: downloadClients.id
	},
	{
		name: 'rootFolders',
		table: rootFolders,
		getRecordKey: (row) => String(row.id),
		conflictTarget: rootFolders.id
	},
	{
		name: 'libraries',
		table: libraries,
		getRecordKey: (row) => String(row.id),
		conflictTarget: libraries.id
	},
	{
		name: 'libraryRootFolders',
		table: libraryRootFolders,
		getRecordKey: (row) => `${String(row.libraryId)}:${String(row.rootFolderId)}`,
		conflictTarget: [libraryRootFolders.libraryId, libraryRootFolders.rootFolderId]
	},
	{
		name: 'librarySettings',
		table: librarySettings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: librarySettings.key
	},
	{
		name: 'namingSettings',
		table: namingSettings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: namingSettings.key
	},
	{
		name: 'namingPresets',
		table: namingPresets,
		getRecordKey: (row) => String(row.id),
		conflictTarget: namingPresets.id
	},
	{
		name: 'delayProfiles',
		table: delayProfiles,
		getRecordKey: (row) => String(row.id),
		conflictTarget: delayProfiles.id
	},
	{
		name: 'languageProfiles',
		table: languageProfiles,
		getRecordKey: (row) => String(row.id),
		conflictTarget: languageProfiles.id
	},
	{
		name: 'subtitleProviders',
		table: subtitleProviders,
		getRecordKey: (row) => String(row.id),
		conflictTarget: subtitleProviders.id
	},
	{
		name: 'subtitleSettings',
		table: subtitleSettings,
		getRecordKey: (row) => String(row.key),
		conflictTarget: subtitleSettings.key
	},
	{
		name: 'indexers',
		table: indexers,
		getRecordKey: (row) => String(row.id),
		conflictTarget: indexers.id
	},
	{
		name: 'nntpServers',
		table: nntpServers,
		getRecordKey: (row) => String(row.id),
		conflictTarget: nntpServers.id
	},
	{
		name: 'archivers',
		table: archivers,
		getRecordKey: (row) => String(row.id),
		conflictTarget: archivers.id
	},
	{
		name: 'mediaBrowserServers',
		table: mediaBrowserServers,
		getRecordKey: (row) => String(row.id),
		conflictTarget: mediaBrowserServers.id
	},
	{
		name: 'stalkerPortals',
		table: stalkerPortals,
		getRecordKey: (row) => String(row.id),
		conflictTarget: stalkerPortals.id
	},
	{
		name: 'livetvAccounts',
		table: livetvAccounts,
		getRecordKey: (row) => String(row.id),
		conflictTarget: livetvAccounts.id
	},
	{
		name: 'channelCategories',
		table: channelCategories,
		getRecordKey: (row) => String(row.id),
		conflictTarget: channelCategories.id
	},
	{
		name: 'channelLineupItems',
		table: channelLineupItems,
		getRecordKey: (row) => String(row.id),
		conflictTarget: channelLineupItems.id
	},
	{
		name: 'channelLineupBackups',
		table: channelLineupBackups,
		getRecordKey: (row) => String(row.id),
		conflictTarget: channelLineupBackups.id
	},
	{
		name: 'smartLists',
		table: smartLists,
		getRecordKey: (row) => String(row.id),
		conflictTarget: smartLists.id
	}
];
const IMPORT_ORDER: TableBackupConfig[] = TABLES;

const SECTION_ORDER: BackupSectionName[] = [
	'system',
	'profiles',
	'downloads',
	'indexers',
	'subtitles',
	'integrations',
	'liveTv'
];

const SECTIONS: Array<{
	id: BackupSectionName;
	label: string;
	tableNames: TableName[];
}> = [
	{
		id: 'system',
		label: 'System & Libraries',
		tableNames: [
			'settings',
			'monitoringSettings',
			'captchaSolverSettings',
			'taskSettings',
			'rootFolders',
			'libraries',
			'libraryRootFolders',
			'librarySettings',
			'namingSettings',
			'namingPresets'
		]
	},
	{
		id: 'profiles',
		label: 'Profiles & Formats',
		tableNames: ['scoringProfiles', 'customFormats', 'delayProfiles', 'languageProfiles']
	},
	{
		id: 'downloads',
		label: 'Download Clients',
		tableNames: ['downloadClients', 'nntpServers']
	},
	{
		id: 'indexers',
		label: 'Indexers',
		tableNames: ['indexers']
	},
	{
		id: 'subtitles',
		label: 'Subtitles',
		tableNames: ['subtitleProviders', 'subtitleSettings']
	},
	{
		id: 'integrations',
		label: 'External Integrations',
		tableNames: ['archivers', 'mediaBrowserServers', 'smartLists']
	},
	{
		id: 'liveTv',
		label: 'Live TV',
		tableNames: [
			'stalkerPortals',
			'livetvAccounts',
			'channelCategories',
			'channelLineupItems',
			'channelLineupBackups'
		]
	}
];

function normalizeSecretKey(value: string): string {
	return value.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function isKeyValueSecretEntry(tableName: TableName, row: Record<string, unknown>): boolean {
	if (!('key' in row) || typeof row.key !== 'string') {
		return false;
	}

	if (tableName === 'settings') {
		return ['tmdb_api_key'].includes(row.key);
	}

	if (tableName === 'captchaSolverSettings') {
		return ['proxy_username', 'proxy_password'].includes(row.key);
	}

	return false;
}

function isSensitiveField(fieldName: string): boolean {
	return SECRET_KEY_NAMES.has(normalizeSecretKey(fieldName));
}

function extractSecrets(
	value: unknown,
	fieldName?: string
): { sanitized: unknown; secret?: unknown } {
	if (fieldName && isSensitiveField(fieldName)) {
		return { sanitized: null, secret: value };
	}

	if (Array.isArray(value)) {
		const sanitizedArray: unknown[] = [];
		const secretArray: unknown[] = [];
		let hasSecret = false;

		for (const item of value) {
			const extracted = extractSecrets(item);
			sanitizedArray.push(extracted.sanitized);
			if (extracted.secret !== undefined) {
				secretArray.push(extracted.secret);
				hasSecret = true;
			} else {
				secretArray.push(null);
			}
		}

		return {
			sanitized: sanitizedArray,
			secret: hasSecret ? secretArray : undefined
		};
	}

	// Dates must be treated as leaves: walking them with Object.entries (which
	// yields nothing) silently reduces them to `{}` in the exported backup.
	if (value instanceof Date) {
		return { sanitized: value };
	}

	if (value && typeof value === 'object') {
		const sanitizedObject: Record<string, unknown> = {};
		const secretObject: Record<string, unknown> = {};
		let hasSecret = false;

		for (const [key, nestedValue] of Object.entries(value)) {
			const extracted = extractSecrets(nestedValue, key);
			sanitizedObject[key] = extracted.sanitized;
			if (extracted.secret !== undefined) {
				secretObject[key] = extracted.secret;
				hasSecret = true;
			}
		}

		return {
			sanitized: sanitizedObject,
			secret: hasSecret ? secretObject : undefined
		};
	}

	return { sanitized: value };
}

function deepMergeRecord<T>(base: T, secret: unknown): T {
	if (secret === undefined || secret === null) {
		return base;
	}

	if (Array.isArray(base) && Array.isArray(secret)) {
		return base.map((item, index) => deepMergeRecord(item, secret[index])) as T;
	}

	if (base && typeof base === 'object' && !Array.isArray(base) && typeof secret === 'object') {
		const merged = { ...(base as Record<string, unknown>) };
		for (const [key, secretValue] of Object.entries(secret as Record<string, unknown>)) {
			merged[key] = key in merged ? deepMergeRecord(merged[key], secretValue) : secretValue;
		}
		return merged as T;
	}

	return secret as T;
}

/**
 * A backup file round-trips through JSON, which serializes Date values to
 * ISO strings. Drizzle's timestamp-mode columns expect Date instances on
 * write (`mapToDriverValue` calls `value.getTime()`), so restoring raw JSON
 * rows fails with "value.getTime is not a function". Convert each value
 * according to its drizzle column type before insert.
 */
function deserializeRestoredRow(
	table: AnySQLiteTable,
	row: Record<string, unknown>
): Record<string, unknown> {
	const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
	const converted: Record<string, unknown> = { ...row };

	for (const [key, column] of Object.entries(columns)) {
		const value = converted[key];
		if (value === null || value === undefined) continue;
		if (column.dataType === 'date') {
			if (typeof value === 'string' || typeof value === 'number') {
				const parsed = new Date(value);
				if (!Number.isNaN(parsed.getTime())) {
					converted[key] = parsed;
					continue;
				}
			}
			// Backups created before Date columns were preserved carry `{}` in
			// their place. The original value is unrecoverable, so drop the key
			// and let the schema default supply a fresh timestamp.
			delete converted[key];
		}
	}

	return converted;
}

function restoreExistingSensitiveValues<T>(incoming: T, existing: unknown, fieldName?: string): T {
	if (fieldName && isSensitiveField(fieldName) && incoming === null) {
		return existing as T;
	}

	if (Array.isArray(incoming) && Array.isArray(existing)) {
		return incoming.map((item, index) =>
			restoreExistingSensitiveValues(item, existing[index])
		) as T;
	}

	if (
		incoming &&
		typeof incoming === 'object' &&
		!Array.isArray(incoming) &&
		existing &&
		typeof existing === 'object' &&
		!Array.isArray(existing)
	) {
		const merged = { ...(incoming as Record<string, unknown>) };

		for (const [key, value] of Object.entries(merged)) {
			merged[key] = restoreExistingSensitiveValues(
				value,
				(existing as Record<string, unknown>)[key],
				key
			);
		}

		return merged as T;
	}

	return incoming;
}

function buildManifest(data: Record<string, unknown[]>): ConfigurationBackupManifest {
	const sections = SECTIONS.map((section) => ({
		id: section.id,
		label: section.label,
		tableNames: section.tableNames,
		totalRows: section.tableNames.reduce(
			(sum, tableName) => sum + (data[tableName]?.length ?? 0),
			0
		)
	}));

	return {
		sectionOrder: SECTION_ORDER,
		sections,
		totalTables: TABLES.length,
		totalRows: Object.values(data).reduce((sum, rows) => sum + rows.length, 0),
		supportsRestoreModes: ['apply']
	};
}

export class ConfigurationBackupService {
	private async readTableRows(config: TableBackupConfig): Promise<Record<string, unknown>[]> {
		return (await db.select().from(config.table)) as Record<string, unknown>[];
	}

	async exportConfig(
		passphrase: string,
		options: ExportConfigOptions = {}
	): Promise<ConfigurationBackupFile> {
		const data: Record<string, unknown[]> = {};
		const secretPayload: BackupSecretPayload = {
			tables: {}
		};

		for (const config of TABLES) {
			let rows: Record<string, unknown>[];
			try {
				rows = await this.readTableRows(config);
			} catch (error) {
				if (config.name === 'downloadClients') {
					logger.error(
						{
							table: config.name,
							component: 'ConfigurationBackupService',
							logDomain: 'settings'
						},
						'Configuration backup failed while reading required table'
					);
					throw new ValidationError(`Configuration backup failed while reading ${config.name}`);
				}
				// Table may not exist (e.g. dropped by a migration but still in the
				// schema definition). Skip it gracefully.
				logger.debug(
					{
						err: error,
						table: config.name,
						component: 'ConfigurationBackupService',
						logDomain: 'settings'
					},
					'Skipping table during backup export (table may not exist)'
				);
				data[config.name] = [];
				continue;
			}
			const sanitizedRows: Record<string, unknown>[] = [];
			const tableSecrets: Record<string, unknown> = {};

			for (const row of rows) {
				const recordKey = config.getRecordKey(row);

				if (isKeyValueSecretEntry(config.name, row)) {
					sanitizedRows.push({ ...row, value: null });
					tableSecrets[recordKey] = { value: row.value };
					continue;
				}

				const extracted = extractSecrets(row);
				sanitizedRows.push(extracted.sanitized as Record<string, unknown>);
				if (extracted.secret !== undefined) {
					tableSecrets[recordKey] = extracted.secret;
				}

				// Debrid token portable transform: decrypt the at-rest encrypted
				// token and store the plaintext in the backup secrets payload so
				// it can be re-encrypted with a different auth secret on restore.
				// If decryption fails, fail the backup closed rather than silently
				// dropping the credential.
				if (config.name === 'downloadClients' && row.apiToken) {
					const plaintext = decryptDebridToken(row.apiToken as string);
					if (plaintext === null) {
						throw new ValidationError(
							`Failed to decrypt debrid token for client ${recordKey}; backup aborted`
						);
					}
					const existingSecret = (tableSecrets[recordKey] as Record<string, unknown>) ?? {};
					existingSecret.apiToken = plaintext;
					existingSecret.apiTokenPlaintext = true;
					tableSecrets[recordKey] = existingSecret;
				}
			}

			data[config.name] = sanitizedRows;
			if (Object.keys(tableSecrets).length > 0) {
				secretPayload.tables[config.name] = tableSecrets;
			}
		}

		if (options.includeIndexerCookies) {
			const cookieRows = await db
				.select({
					indexerId: indexerStatus.indexerId,
					cookies: indexerStatus.cookies,
					cookiesExpirationDate: indexerStatus.cookiesExpirationDate
				})
				.from(indexerStatus);

			const activeCookieRows = cookieRows.filter(
				(row) =>
					!!row.cookies &&
					!!row.cookiesExpirationDate &&
					new Date(row.cookiesExpirationDate).getTime() > Date.now()
			);

			if (activeCookieRows.length > 0) {
				secretPayload.indexerCookies = Object.fromEntries(
					activeCookieRows.map((row) => [
						row.indexerId,
						{
							cookies: row.cookies as Record<string, string>,
							expiry: row.cookiesExpirationDate as string
						}
					])
				);
			}
		}

		return {
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			createdAt: new Date().toISOString(),
			manifest: buildManifest(data),
			options: {
				includeIndexerCookies: !!options.includeIndexerCookies
			},
			data,
			secrets: encryptBackupPayload(secretPayload as unknown as Record<string, unknown>, passphrase)
		};
	}

	async restoreConfig(
		backup: ConfigurationBackupFile,
		options: RestoreConfigOptions
	): Promise<RestoreConfigResult> {
		this.validateBackupFile(backup);

		const mode = options.mode ?? 'apply';
		if (mode !== 'apply') {
			throw new ValidationError(
				'Replace-all restore mode is not implemented yet. Use apply mode to avoid breaking existing references.'
			);
		}

		const selectedSections =
			options.sections && options.sections.length > 0
				? new Set(options.sections)
				: new Set<BackupSectionName>(SECTION_ORDER);
		const selectedTableNames = new Set<TableName>(
			SECTIONS.filter((section) => selectedSections.has(section.id)).flatMap(
				(section) => section.tableNames
			)
		);
		if (selectedSections.has('downloads')) selectedTableNames.add('settings');
		const warnings: string[] = [];
		let decryptedSecrets: BackupSecretPayload;
		try {
			decryptedSecrets = decryptBackupPayload(
				backup.secrets,
				options.passphrase
			) as unknown as BackupSecretPayload;
		} catch (error) {
			logger.error(
				{ err: error, component: 'ConfigurationBackupService', logDomain: 'settings' },
				'Failed to decrypt configuration backup'
			);
			throw new ValidationError('Invalid backup passphrase or corrupted secret payload');
		}

		const preparedTables: PreparedRestoreTable[] = [];
		const restoredTables: TableName[] = [];

		for (const config of IMPORT_ORDER) {
			if (!selectedTableNames.has(config.name)) {
				continue;
			}

			const rawRows =
				config.name === 'settings' &&
				selectedSections.has('downloads') &&
				!selectedSections.has('system')
					? (backup.data[config.name] ?? []).filter(
							(row) => (row as Record<string, unknown>).key === 'default_acquisition_protocol'
						)
					: (backup.data[config.name] ?? []);
			if (!Array.isArray(rawRows) || rawRows.length === 0) {
				continue;
			}

			const tableSecrets =
				(decryptedSecrets.tables?.[config.name] as Record<string, unknown> | undefined) ?? {};
			const existingRows = (await db.select().from(config.table)) as Record<string, unknown>[];
			const existingRowMap = new Map(
				existingRows.map((row) => [config.getRecordKey(row), row] as const)
			);

			const restoredRows = rawRows.map((rawRow) => {
				const row = rawRow as Record<string, unknown>;
				const recordKey = config.getRecordKey(row);
				const restoredWithSecrets = deepMergeRecord(row, tableSecrets[recordKey]);
				const restored = deserializeRestoredRow(
					config.table,
					restoreExistingSensitiveValues(restoredWithSecrets, existingRowMap.get(recordKey))
				);

				// Debrid token portable transform: re-encrypt the plaintext token
				// from the backup secrets with the destination auth secret before
				// writing to the DB. We use explicit metadata in the backup secrets
				// payload (apiTokenPlaintext: true) to decide. If that flag is absent
				// and the value looks like ciphertext, preserve it as-is; otherwise
				// treat it as plaintext and re-encrypt it.
				if (config.name === 'downloadClients') {
					const restoredRecord = restored as Record<string, unknown>;
					const secretEntry = tableSecrets[recordKey] as Record<string, unknown> | undefined;
					if (typeof restoredRecord.apiToken === 'string' && restoredRecord.apiToken.length > 0) {
						const isPlaintextFromSecrets = secretEntry?.apiTokenPlaintext === true;
						if (isPlaintextFromSecrets) {
							restoredRecord.apiToken = encryptDebridToken(restoredRecord.apiToken);
						} else {
							const parts = restoredRecord.apiToken.split(':');
							const looksEncrypted =
								parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
							if (!looksEncrypted) {
								restoredRecord.apiToken = encryptDebridToken(restoredRecord.apiToken);
							}
						}
					}
				}

				return restored;
			});

			preparedTables.push({
				config,
				rows: restoredRows
			});
			restoredTables.push(config.name);
		}

		db.transaction((tx) => {
			for (const preparedTable of preparedTables) {
				for (const restoredRow of preparedTable.rows) {
					tx.insert(preparedTable.config.table)
						.values(restoredRow as never)
						.onConflictDoUpdate({
							target: preparedTable.config.conflictTarget,
							set: restoredRow as never
						})
						.run();
				}
			}
		});

		if (selectedSections.has('indexers') && decryptedSecrets.indexerCookies) {
			const cookieStore = getCookieStore();
			for (const [indexerId, stored] of Object.entries(decryptedSecrets.indexerCookies)) {
				await cookieStore.clear(indexerId);
				await cookieStore.save(indexerId, stored.cookies, new Date(stored.expiry));
			}
		}

		return {
			restoredSections: SECTION_ORDER.filter((section) => selectedSections.has(section)),
			restoredTables,
			secretsRestored: true,
			warnings: [...new Set(warnings)]
		};
	}

	private validateBackupFile(backup: ConfigurationBackupFile): void {
		if (backup.format !== BACKUP_FORMAT) {
			throw new ValidationError('Unsupported backup format');
		}

		if (backup.version !== BACKUP_VERSION) {
			throw new ValidationError(`Unsupported backup version: ${backup.version}`);
		}

		if (!backup.data || typeof backup.data !== 'object') {
			throw new ValidationError('Backup file is missing configuration data');
		}
	}
}

let _instance: ConfigurationBackupService | null = null;

export function getConfigurationBackupService(): ConfigurationBackupService {
	if (!_instance) {
		_instance = new ConfigurationBackupService();
	}
	return _instance;
}
