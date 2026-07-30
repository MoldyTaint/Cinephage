import { describe, it, expect, afterEach } from 'vitest';

describe('core/version', () => {
	describe('resolveAppVersion', () => {
		it('returns APP_VERSION env when set', async () => {
			process.env.APP_VERSION = '2.5.1';
			const { resolveAppVersion } = await import('./version.js');
			expect(resolveAppVersion()).toBe('2.5.1');
		});

		it('falls back to dev-local when APP_VERSION is the placeholder', async () => {
			process.env.APP_VERSION = '0.1.0';
			delete process.env.npm_package_version;
			const { resolveAppVersion } = await import('./version.js');
			expect(resolveAppVersion()).toBe('dev-local');
		});

		it('falls back to dev-local when APP_VERSION is unset', async () => {
			delete process.env.APP_VERSION;
			delete process.env.npm_package_version;
			const { resolveAppVersion } = await import('./version.js');
			expect(resolveAppVersion()).toBe('dev-local');
		});
	});

	describe('resolveAppCommit', () => {
		afterEach(() => {
			delete process.env.APP_COMMIT;
		});

		it('returns APP_COMMIT env when set', async () => {
			process.env.APP_COMMIT = 'abc1234';
			const { resolveAppCommit } = await import('./version.js');
			expect(resolveAppCommit()).toBe('abc1234');
		});

		it('returns null when APP_COMMIT is unset', async () => {
			delete process.env.APP_COMMIT;
			const { resolveAppCommit } = await import('./version.js');
			expect(resolveAppCommit()).toBeNull();
		});

		it('returns null when APP_COMMIT is empty', async () => {
			process.env.APP_COMMIT = '   ';
			const { resolveAppCommit } = await import('./version.js');
			expect(resolveAppCommit()).toBeNull();
		});
	});

	describe('getServerIdentity', () => {
		afterEach(() => {
			delete process.env.APP_VERSION;
			delete process.env.APP_COMMIT;
		});

		it('uses settings overrides when provided', async () => {
			process.env.APP_VERSION = 'env-version';
			process.env.APP_COMMIT = 'env-commit';
			const { getServerIdentity } = await import('./version.js');
			const identity = getServerIdentity({
				versionOverride: 'override-v',
				commitOverride: 'override-c'
			});
			expect(identity.version).toBe('override-v');
			expect(identity.commit).toBe('override-c');
		});

		it('falls back to env vars when overrides are null', async () => {
			process.env.APP_VERSION = 'env-version';
			process.env.APP_COMMIT = 'env-commit';
			const { getServerIdentity } = await import('./version.js');
			const identity = getServerIdentity({
				versionOverride: null,
				commitOverride: null
			});
			expect(identity.version).toBe('env-version');
			expect(identity.commit).toBe('env-commit');
		});

		it('returns null commit when neither override nor env is set', async () => {
			process.env.APP_VERSION = 'env-version';
			delete process.env.APP_COMMIT;
			const { getServerIdentity } = await import('./version.js');
			const identity = getServerIdentity({
				versionOverride: null,
				commitOverride: null
			});
			expect(identity.version).toBe('env-version');
			expect(identity.commit).toBeNull();
		});

		it('isConfigured returns false when commit is missing', async () => {
			delete process.env.APP_COMMIT;
			const { getServerIdentity } = await import('./version.js');
			const identity = getServerIdentity({
				versionOverride: null,
				commitOverride: null
			});
			expect(identity.isConfigured).toBe(false);
		});

		it('isConfigured returns true when both version and commit are present', async () => {
			process.env.APP_VERSION = 'v1';
			process.env.APP_COMMIT = 'c1';
			const { getServerIdentity } = await import('./version.js');
			const identity = getServerIdentity({
				versionOverride: null,
				commitOverride: null
			});
			expect(identity.isConfigured).toBe(true);
		});
	});
});
