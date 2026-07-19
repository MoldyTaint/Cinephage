import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../../test/db-helper';
import { downloadClients } from '$lib/server/db/schema';

const testDb = createTestDb();
const DEFAULT_SECRET = process.env.BETTER_AUTH_SECRET ?? 'test-secret';

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

describe('ConfigurationBackupService debrid safety', () => {
	afterEach(() => {
		testDb.db.delete(downloadClients).run();
		process.env.BETTER_AUTH_SECRET = DEFAULT_SECRET;
	});

	it('restores plaintext tokens without guessing their format', async () => {
		const { getConfigurationBackupService } = await import('./ConfigurationBackupService');
		const { encryptBackupPayload } = await import('$lib/server/crypto/backupCrypto');
		const { decryptDebridToken } = await import('$lib/server/crypto/debridTokenCrypto');
		const clientId = 'debrid-client-1';
		const token = 'looks:like:encrypted:but:is:plaintext';
		const backup = {
			format: 'cinephage-config-backup' as const,
			version: 1 as const,
			createdAt: new Date().toISOString(),
			manifest: undefined,
			options: {},
			data: {
				downloadClients: [
					{
						id: clientId,
						name: 'Real-Debrid',
						implementation: 'realdebrid',
						enabled: true,
						host: 'api.real-debrid.com',
						port: 443,
						apiToken: null,
						removeAfterImport: true,
						priority: 1
					}
				]
			},
			secrets: encryptBackupPayload(
				{ tables: { downloadClients: { [clientId]: { apiToken: token } } } },
				'passphrase-12345'
			)
		};

		process.env.BETTER_AUTH_SECRET = 'restore-no-regex-secret';
		await getConfigurationBackupService().restoreConfig(backup, {
			passphrase: 'passphrase-12345',
			sections: ['downloads']
		});
		const row = testDb.sqlite
			.prepare(`SELECT "api_token" FROM "download_clients" WHERE "id" = ?`)
			.get(clientId) as { api_token: string };

		expect(decryptDebridToken(row.api_token)).toBe(token);
	});

	it('fails export closed when a stored token cannot be decrypted', async () => {
		const { DownloadClientManager } =
			await import('$lib/server/downloadClients/DownloadClientManager');
		const { getConfigurationBackupService } = await import('./ConfigurationBackupService');

		process.env.BETTER_AUTH_SECRET = 'backup-export-secret-A';
		await new DownloadClientManager().createClient({
			name: 'Real-Debrid',
			implementation: 'realdebrid',
			apiToken: 'unrecoverable-token',
			priority: 1
		});
		process.env.BETTER_AUTH_SECRET = 'backup-export-secret-B';

		await expect(
			getConfigurationBackupService().exportConfig('passphrase-12345')
		).rejects.toThrow();
	});
});
