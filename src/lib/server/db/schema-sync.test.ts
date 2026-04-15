import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { syncSchema } from './schema-sync';

const databases: Database.Database[] = [];

function createTestDatabase(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	return sqlite;
}

function getColumnNames(sqlite: Database.Database, tableName: string): string[] {
	return (
		sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>
	).map((column) => column.name);
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
	return !!sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
		.get(tableName);
}

afterEach(() => {
	for (const sqlite of databases.splice(0)) {
		sqlite.close();
	}
});

describe('syncSchema Better Auth repair', () => {
	it('creates Better Auth plugin tables for a fresh database', () => {
		const sqlite = createTestDatabase();

		syncSchema(sqlite);

		expect(tableExists(sqlite, 'apikey')).toBe(true);
		expect(tableExists(sqlite, 'rateLimit')).toBe(true);
		expect(getColumnNames(sqlite, 'user')).toEqual(
			expect.arrayContaining([
				'email',
				'username',
				'displayUsername',
				'role',
				'banned',
				'banReason',
				'banExpires'
			])
		);
		expect(getColumnNames(sqlite, 'session')).toContain('impersonatedBy');
	});

	it('repairs broken Better Auth tables from an existing schema version', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"role" text DEFAULT 'admin' NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "session" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"token" text NOT NULL UNIQUE,
					"expiresAt" date NOT NULL,
					"ipAddress" text,
					"userAgent" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "account" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"accountId" text NOT NULL,
					"providerId" text NOT NULL,
					"accessToken" text,
					"refreshToken" text,
					"accessTokenExpiresAt" date,
					"refreshTokenExpiresAt" date,
					"scope" text,
					"idToken" text,
					"password" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "verification" (
					"id" text PRIMARY KEY NOT NULL,
					"identifier" text NOT NULL,
					"value" text NOT NULL,
					"expiresAt" date NOT NULL,
					"createdAt" date,
					"updatedAt" date
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '62')`).run();

		syncSchema(sqlite);

		expect(tableExists(sqlite, 'apikey')).toBe(true);
		expect(tableExists(sqlite, 'rateLimit')).toBe(true);
		expect(getColumnNames(sqlite, 'user')).toEqual(
			expect.arrayContaining([
				'name',
				'email',
				'emailVerified',
				'image',
				'username',
				'displayUsername',
				'role',
				'banned',
				'banReason',
				'banExpires',
				'createdAt',
				'updatedAt'
			])
		);
		expect(getColumnNames(sqlite, 'session')).toContain('impersonatedBy');

		const userTable = sqlite
			.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='user'`)
			.get() as { sql: string };
		expect(userTable.sql).toContain('"email" text NOT NULL');
	});

	it('promotes a sole legacy bootstrap user to admin', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text,
					"email" text NOT NULL,
					"emailVerified" integer DEFAULT 0,
					"image" text,
					"username" text UNIQUE,
					"displayUsername" text,
					"role" text DEFAULT 'admin' NOT NULL,
					"banned" integer DEFAULT 0,
					"banReason" text,
					"banExpires" date,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "user" ("id", "email", "username", "role", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				'user-1',
				'admin@example.com',
				'admin',
				'user',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '63')`).run();

		syncSchema(sqlite);

		const row = sqlite.prepare(`SELECT "role" FROM "user" WHERE "id" = 'user-1'`).get() as {
			role: string;
		};

		expect(row.role).toBe('admin');
	});

	it('repairs legacy snake_case auth columns without failing startup', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text,
					"email" text NOT NULL,
					"emailVerified" integer DEFAULT 0,
					"image" text,
					"username" text UNIQUE,
					"displayUsername" text,
					"role" text DEFAULT 'admin' NOT NULL,
					"banned" integer DEFAULT 0,
					"banReason" text,
					"banExpires" date,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "session" (
					"id" text PRIMARY KEY NOT NULL,
					"user_id" text NOT NULL,
					"token" text NOT NULL UNIQUE,
					"expires_at" date NOT NULL,
					"ip_address" text,
					"user_agent" text,
					"created_at" date NOT NULL,
					"updated_at" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "account" (
					"id" text PRIMARY KEY NOT NULL,
					"user_id" text NOT NULL,
					"account_id" text NOT NULL,
					"provider_id" text NOT NULL,
					"created_at" date NOT NULL,
					"updated_at" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "apikey" (
					"id" text PRIMARY KEY NOT NULL,
					"key" text NOT NULL,
					"user_id" text NOT NULL,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '62')`).run();

		sqlite
			.prepare(
				`INSERT INTO "user" ("id", "email", "username", "role", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				'user-legacy',
				'legacy@example.com',
				'legacy-user',
				'admin',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);
		sqlite
			.prepare(
				`INSERT INTO "session" ("id", "user_id", "token", "expires_at", "created_at", "updated_at")
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				'session-legacy',
				'user-legacy',
				'legacy-token',
				'2026-04-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);
		sqlite
			.prepare(
				`INSERT INTO "account" ("id", "user_id", "account_id", "provider_id", "created_at", "updated_at")
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				'account-legacy',
				'user-legacy',
				'provider-account',
				'credentials',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);
		sqlite
			.prepare(
				`INSERT INTO "apikey" ("id", "key", "user_id", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, ?)`
			)
			.run(
				'apikey-legacy',
				'legacy-apikey',
				'user-legacy',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);

		expect(() => syncSchema(sqlite)).not.toThrow();

		expect(getColumnNames(sqlite, 'session')).toEqual(
			expect.arrayContaining(['userId', 'expiresAt'])
		);
		expect(getColumnNames(sqlite, 'account')).toEqual(
			expect.arrayContaining(['userId', 'accountId', 'providerId'])
		);
		expect(getColumnNames(sqlite, 'apikey')).toEqual(
			expect.arrayContaining(['referenceId', 'configId'])
		);

		const sessionRow = sqlite
			.prepare(`SELECT "userId" FROM "session" WHERE "id" = ?`)
			.get('session-legacy') as { userId: string };
		expect(sessionRow.userId).toBe('user-legacy');
	});

	it('adds and backfills rateLimit.id for legacy rateLimit tables', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "rateLimit" (
					"key" text PRIMARY KEY NOT NULL,
					"count" integer NOT NULL,
					"lastRequest" integer NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '64')`).run();
		sqlite
			.prepare(`INSERT INTO "rateLimit" ("key", "count", "lastRequest") VALUES (?, ?, ?)`)
			.run('ip|/sign-in', 2, Date.now());

		expect(() => syncSchema(sqlite)).not.toThrow();
		expect(getColumnNames(sqlite, 'rateLimit')).toEqual(
			expect.arrayContaining(['id', 'key', 'count', 'lastRequest'])
		);

		const row = sqlite
			.prepare(`SELECT "id", "key", "count" FROM "rateLimit" WHERE "key" = ?`)
			.get('ip|/sign-in') as { id: string; key: string; count: number };
		expect(row.id).toBeTruthy();
		expect(row.key).toBe('ip|/sign-in');
		expect(row.count).toBe(2);
	});

	it('migrates saved custom format audio conditions to canonical schema', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text,
					"email" text NOT NULL,
					"emailVerified" integer DEFAULT 0,
					"image" text,
					"username" text UNIQUE,
					"displayUsername" text,
					"role" text DEFAULT 'admin' NOT NULL,
					"language" text DEFAULT 'en',
					"banned" integer DEFAULT 0,
					"banReason" text,
					"banExpires" date,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "session" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"token" text NOT NULL UNIQUE,
					"expiresAt" date NOT NULL,
					"ipAddress" text,
					"userAgent" text,
					"impersonatedBy" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "account" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"accountId" text NOT NULL,
					"providerId" text NOT NULL,
					"accessToken" text,
					"refreshToken" text,
					"accessTokenExpiresAt" date,
					"refreshTokenExpiresAt" date,
					"scope" text,
					"idToken" text,
					"password" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "verification" (
					"id" text PRIMARY KEY NOT NULL,
					"identifier" text NOT NULL,
					"value" text NOT NULL,
					"expiresAt" date NOT NULL,
					"createdAt" date,
					"updatedAt" date
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "apikey" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text,
					"start" text,
					"prefix" text,
					"key" text NOT NULL,
					"referenceId" text NOT NULL,
					"configId" text DEFAULT 'default',
					"refillInterval" integer,
					"refillAmount" integer,
					"lastRefillAt" date,
					"enabled" integer DEFAULT 1,
					"rateLimitEnabled" integer DEFAULT 1,
					"rateLimitTimeWindow" integer,
					"rateLimitMax" integer,
					"requestCount" integer DEFAULT 0,
					"remaining" integer,
					"lastRequest" date,
					"expiresAt" date,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL,
					"permissions" text,
					"metadata" text
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "rateLimit" (
					"id" text PRIMARY KEY NOT NULL,
					"key" text NOT NULL UNIQUE,
					"count" integer NOT NULL,
					"lastRequest" integer NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "custom_formats" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text NOT NULL,
					"description" text,
					"category" text NOT NULL DEFAULT 'other',
					"tags" text,
					"conditions" text,
					"enabled" integer DEFAULT true,
					"created_at" text,
					"updated_at" text
				)`
			)
			.run();
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '78')`).run();
		sqlite
			.prepare(
				`INSERT INTO "custom_formats" ("id", "name", "category", "conditions") VALUES (?, ?, ?, ?)`
			)
			.run(
				'legacy-audio-format',
				'Legacy Audio Format',
				'audio',
				JSON.stringify([
					{
						name: 'Legacy DD+',
						type: 'audio',
						required: true,
						negate: false,
						audio: 'dd+'
					},
					{
						name: 'Legacy Atmos',
						type: 'audio',
						required: false,
						negate: false,
						audio: 'atmos'
					}
				])
			);

		syncSchema(sqlite);

		const row = sqlite
			.prepare(`SELECT "conditions" FROM "custom_formats" WHERE "id" = 'legacy-audio-format'`)
			.get() as { conditions: string };
		const conditions = JSON.parse(row.conditions) as Array<Record<string, unknown>>;

		expect(conditions).toEqual([
			{
				name: 'Legacy DD+',
				type: 'audio_codec',
				required: true,
				negate: false,
				audioCodec: 'dd+'
			},
			{
				name: 'Legacy Atmos',
				type: 'audio_atmos',
				required: false,
				negate: false
			}
		]);
	});
});
