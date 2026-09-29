/**
 * Integration tests for the REAL Better Auth instance.
 *
 * Every other auth test in the suite mocks `auth`; these tests run the actual
 * betterAuth() construction against a throwaway SQLite database so cookie
 * shapes, plugin wiring, the single-admin database hooks, and the managed
 * API-key lifecycle are exercised end to end. They are the safety net for
 * refactors of the auth layer.
 *
 * Test order matters: the database starts empty, the first test creates the
 * sole admin, and later tests rely on that state (single-admin policy, sign-in).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis(),
	fatal: vi.fn(),
	trace: vi.fn()
}));

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger),
	createRequestLogger: vi.fn(() => mockLogger),
	runWithLogContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn())
}));

const harness = await import('../../../test/auth-test-harness.js').then((m) =>
	m.createAuthTestHarness({ withHooks: false })
);
const { db } = await import('$lib/server/db/index.js');
const { user, session, authRateLimits } = await import('$lib/server/db/schema.js');
const { ensureDefaultApiKeysForUser, getRecoverableApiKeyValue } =
	await import('$lib/server/auth/api-keys.js');

const USERNAME = 'testcurator';
const EMAIL = 'curator@test.local';
const PASSWORD = 'correct-horse-battery';

// Shared across the managed-keys block: ensureDefaultApiKeysForUser is
// idempotent, so only the first call returns the plaintext keys.
let mainKey = '';

beforeEach(() => {
	// Better Auth's database-backed limiter counts every auth request across
	// tests (max 5 per 15 min); reset it so each test measures only itself.
	db.delete(authRateLimits).run();
});

afterAll(() => {
	harness.cleanup();
});

describe('real Better Auth instance — setup and single-admin policy', () => {
	it('signs up the first user as the sole admin via /sign-up/email', async () => {
		const response = await harness.authRequest('/sign-up/email', {
			method: 'POST',
			body: JSON.stringify({
				email: EMAIL,
				password: PASSWORD,
				name: 'Test Curator',
				username: USERNAME
			})
		});

		expect(response.status).toBe(200);

		const row = db.select().from(user).all()[0];
		expect(row).toBeDefined();
		expect(row.email).toBe(EMAIL);
		expect(row.username).toBe(USERNAME);
		expect(row.role).toBe('admin');
	});

	it('rejects a second account with FORBIDDEN once setup is complete', async () => {
		const response = await harness.authRequest('/sign-up/email', {
			method: 'POST',
			body: JSON.stringify({
				email: 'second@test.local',
				password: PASSWORD,
				name: 'Second User',
				username: 'secondcurator'
			})
		});

		expect(response.status).toBe(403);
		const body = (await response.json()) as { message?: string };
		expect(body.message).toContain('Only one admin');
	});
});

describe('real Better Auth instance — username sign-in and sessions', () => {
	it('issues a session cookie on successful username sign-in', async () => {
		const response = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: PASSWORD })
		});

		expect(response.status).toBe(200);
		const cookies = harness.extractCookies(response);
		const sessionCookieName = Object.keys(cookies).find((name) => name.includes('session_token'));
		expect(sessionCookieName).toBeDefined();

		const session = await harness.auth.api.getSession({
			headers: new Headers({ cookie: harness.cookieHeader(cookies) })
		});
		expect(session?.user?.email).toBe(EMAIL);
		expect(session?.user?.username).toBe(USERNAME);
		expect(session?.user?.role).toBe('admin');
	});

	it('rejects a wrong password', async () => {
		const response = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: 'wrong-password' })
		});

		expect(response.status).toBe(401);
	});
});

describe('real Better Auth instance — managed API keys', () => {
	it('creates main and streaming keys that round-trip through encrypted recovery', async () => {
		const signIn = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: PASSWORD })
		});
		expect(signIn.status).toBe(200);
		const sessionHeaders = new Headers({
			cookie: harness.cookieHeader(harness.extractCookies(signIn))
		});
		const session = await harness.auth.api.getSession({ headers: sessionHeaders });
		expect(session?.user?.id).toBeDefined();

		const keys = await ensureDefaultApiKeysForUser(session!.user.id, sessionHeaders);
		expect(keys.mainKey?.key).toMatch(/^cinephage_/);
		expect(keys.streamingKey?.key).toMatch(/^cinephage_/);
		mainKey = keys.mainKey!.key;

		// The encrypted secret must decrypt back to the plaintext the plugin returned.
		await expect(getRecoverableApiKeyValue(keys.mainKey!.id)).resolves.toBe(keys.mainKey!.key);
		await expect(getRecoverableApiKeyValue(keys.streamingKey!.id)).resolves.toBe(
			keys.streamingKey!.key
		);

		// Permission semantics the streaming gate depends on (hooks.server.ts
		// verifies streaming first, then falls back to the main key).
		const mainAsFull = await harness.auth.api.verifyApiKey({
			body: { key: keys.mainKey!.key, permissions: { default: ['*'] } }
		});
		expect(mainAsFull.valid).toBe(true);

		const streamingAsStreaming = await harness.auth.api.verifyApiKey({
			body: { key: keys.streamingKey!.key, permissions: { streaming: ['*'] } }
		});
		expect(streamingAsStreaming.valid).toBe(true);

		const mainAsStreaming = await harness.auth.api.verifyApiKey({
			body: { key: keys.mainKey!.key, permissions: { streaming: ['*'] } }
		});
		expect(mainAsStreaming.valid).toBe(false);

		const garbage = await harness.auth.api.verifyApiKey({
			body: { key: 'cinephage_not_a_real_key', permissions: { default: ['*'] } }
		});
		expect(garbage.valid).toBe(false);
	});

	it('authenticates getSession with an x-api-key header (enableSessionForAPIKeys)', async () => {
		const signIn = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: PASSWORD })
		});
		const sessionHeaders = new Headers({
			cookie: harness.cookieHeader(harness.extractCookies(signIn))
		});
		const session = await harness.auth.api.getSession({ headers: sessionHeaders });

		const apiSession = await harness.auth.api.getSession({
			headers: new Headers({ 'x-api-key': mainKey })
		});
		expect(apiSession?.user?.id).toBe(session!.user.id);
	});

	it('revokes the session on sign-out', async () => {
		const signIn = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: PASSWORD })
		});
		const cookies = harness.extractCookies(signIn);
		const cookie = harness.cookieHeader(cookies);
		const sessionCookieName = Object.keys(cookies).find((name) => name.includes('session_token'))!;
		// Signed cookie values are `<token>.<signature>`; the DB stores the bare token.
		const token = cookies[sessionCookieName].split('.')[0];

		const signOut = await harness.authRequest('/sign-out', {
			method: 'POST',
			headers: { cookie }
		});
		expect(signOut.ok).toBe(true);

		// Sign-out deletes the session row and clears the cookie. Note: with
		// cookieCache.maxAge equal to the session lifetime, a REPLAYED old
		// cookie value still resolves via the cached JWT — a known tradeoff of
		// the current config, not something sign-out can prevent.
		const rows = db.select().from(session).where(eq(session.token, token)).all();
		expect(rows).toHaveLength(0);

		const cleared = harness.extractCookies(signOut)[sessionCookieName];
		expect(cleared ?? '').toBe('');
	});
});

describe('real Better Auth instance — multi-user readiness', () => {
	it('admin plugin createUser adds a user-role account once setup is complete', async () => {
		const signIn = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: USERNAME, password: PASSWORD })
		});
		const sessionHeaders = new Headers({
			cookie: harness.cookieHeader(harness.extractCookies(signIn))
		});

		// The admin plugin's createUser reads the request event internally.
		const created = await harness.withStore(
			harness.makeEvent('POST', '/api/auth/admin/create-user').event,
			() =>
				harness.auth.api.createUser({
					body: {
						email: 'viewer@test.local',
						password: 'viewer-password-123',
						name: 'Test Viewer',
						role: 'user',
						data: { username: 'testviewer' }
					},
					headers: sessionHeaders
				})
		);
		expect(created.user?.id).toBeDefined();

		const rows = db.select().from(user).all();
		expect(rows).toHaveLength(2);
		const viewer = rows.find((row) => row.username === 'testviewer');
		expect(viewer?.role).toBe('user');
	});

	it('the user-role account signs in and is not silently promoted', async () => {
		const response = await harness.authRequest('/sign-in/username', {
			method: 'POST',
			body: JSON.stringify({ username: 'testviewer', password: 'viewer-password-123' })
		});
		expect(response.status).toBe(200);

		const session = await harness.auth.api.getSession({
			headers: new Headers({ cookie: harness.cookieHeader(harness.extractCookies(response)) })
		});
		expect(session?.user?.role).toBe('user');
	});

	it('anonymous self-registration stays closed with multiple accounts present', async () => {
		const response = await harness.authRequest('/sign-up/email', {
			method: 'POST',
			body: JSON.stringify({
				email: 'third@test.local',
				password: PASSWORD,
				name: 'Third User',
				username: 'thirdcurator'
			})
		});
		expect(response.status).toBe(403);
	});
});
