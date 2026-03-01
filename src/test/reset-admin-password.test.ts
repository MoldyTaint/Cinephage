import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { verifyPassword } from 'better-auth/crypto';
import {
	listAdminUsers,
	parseArgs,
	resetAdminPassword,
	resolveNewPassword,
	selectAdminUser
} from '../../scripts/reset-admin-password.js';

function createTestDb() {
	const db = new Database(':memory:');

	db.exec(`
		CREATE TABLE "user" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text,
			"email" text NOT NULL,
			"username" text,
			"displayUsername" text,
			"role" text NOT NULL,
			"createdAt" text NOT NULL
		);

		CREATE TABLE "account" (
			"id" text PRIMARY KEY NOT NULL,
			"userId" text NOT NULL,
			"accountId" text NOT NULL,
			"providerId" text NOT NULL,
			"password" text,
			"createdAt" text NOT NULL,
			"updatedAt" text NOT NULL
		);

		CREATE TABLE "session" (
			"id" text PRIMARY KEY NOT NULL,
			"userId" text NOT NULL
		);
	`);

	return db;
}

function insertAdmin(db: Database.Database, overrides = {}) {
	db.prepare(
		`INSERT INTO "user" ("id", "name", "email", "username", "displayUsername", "role", "createdAt")
		 VALUES (@id, @name, @email, @username, @displayUsername, @role, @createdAt)`
	).run({
		id: 'admin-user',
		name: 'Admin User',
		email: 'admin@example.com',
		username: 'admin',
		displayUsername: 'Admin',
		role: 'admin',
		createdAt: '2026-03-01T00:00:00.000Z',
		...overrides
	});
}

describe('reset-admin-password script helpers', () => {
	it('parses selectors and password modes', () => {
		expect(parseArgs(['--username', 'admin', '--password', 'secret123!'])).toEqual({
			username: 'admin',
			email: null,
			userId: null,
			password: 'secret123!',
			passwordStdin: false,
			listAdmins: false,
			keepSessions: false,
			help: false
		});
	});

	it('selects the sole admin by default', () => {
		const db = createTestDb();
		insertAdmin(db);

		expect(listAdminUsers(db)).toHaveLength(1);
		expect(selectAdminUser(db, parseArgs([])).username).toBe('admin');

		db.close();
	});

	it('requires a selector when multiple admins exist', () => {
		const db = createTestDb();
		insertAdmin(db);
		insertAdmin(db, {
			id: 'second-admin',
			email: 'second@example.com',
			username: 'second_admin'
		});

		expect(() => selectAdminUser(db, parseArgs([]))).toThrow(/Multiple admin users found/);

		db.close();
	});

	it('updates an existing credential password and revokes sessions', async () => {
		const db = createTestDb();
		insertAdmin(db);

		db.prepare(
			`INSERT INTO "account" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		).run(
			'credential-account',
			'admin-user',
			'admin-user',
			'credential',
			'old:hash',
			'2026-03-01T00:00:00.000Z',
			'2026-03-01T00:00:00.000Z'
		);
		db.prepare(`INSERT INTO "session" ("id", "userId") VALUES (?, ?), (?, ?)`).run(
			'session-1',
			'admin-user',
			'session-2',
			'admin-user'
		);

		const result = await resetAdminPassword(
			db,
			selectAdminUser(db, parseArgs(['--username', 'admin'])),
			'NewPass123!'
		);

		const account = db
			.prepare(`SELECT password FROM "account" WHERE id = ?`)
			.get('credential-account') as { password: string };
		const sessions = db
			.prepare(`SELECT COUNT(*) as count FROM "session" WHERE userId = ?`)
			.get('admin-user') as { count: number };

		expect(result.createdCredentialAccount).toBe(false);
		expect(result.revokedSessions).toBe(2);
		expect(sessions.count).toBe(0);
		expect(await verifyPassword({ hash: account.password, password: 'NewPass123!' })).toBe(true);

		db.close();
	});

	it('creates a credential account when missing', async () => {
		const db = createTestDb();
		insertAdmin(db);

		const result = await resetAdminPassword(
			db,
			selectAdminUser(db, parseArgs(['--email', 'admin@example.com'])),
			'NewPass123!'
		);

		const account = db
			.prepare(`SELECT userId, accountId, providerId, password FROM "account" WHERE userId = ?`)
			.get('admin-user') as {
			userId: string;
			accountId: string;
			providerId: string;
			password: string;
		};

		expect(result.createdCredentialAccount).toBe(true);
		expect(account.userId).toBe('admin-user');
		expect(account.accountId).toBe('admin-user');
		expect(account.providerId).toBe('credential');
		expect(await verifyPassword({ hash: account.password, password: 'NewPass123!' })).toBe(true);

		db.close();
	});

	it('validates password length before reset', async () => {
		await expect(resolveNewPassword(parseArgs(['--password', 'short']))).rejects.toThrow(
			/at least 8 characters/
		);
	});
});
