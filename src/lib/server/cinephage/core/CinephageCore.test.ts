import { describe, it, expect, vi } from 'vitest';
import type { CinephageSettingsService } from '../settings/CinephageSettingsService.js';

function createMockSettings(
	overrides: Partial<{
		enabled: boolean;
		baseUrl: string;
		versionOverride: string | null;
		commitOverride: string | null;
	}> = {}
): CinephageSettingsService {
	return {
		getConfig: vi.fn().mockResolvedValue({
			enabled: overrides.enabled ?? true,
			baseUrl: overrides.baseUrl ?? 'https://api.cinephage.net',
			versionOverride: overrides.versionOverride ?? null,
			commitOverride: overrides.commitOverride ?? null
		}),
		getModuleConfig: vi.fn(),
		updateConfig: vi.fn(),
		setModuleEnabled: vi.fn(),
		updateModuleSettings: vi.fn(),
		recordModuleError: vi.fn(),
		clearModuleError: vi.fn()
	} as unknown as CinephageSettingsService;
}

describe('CinephageCore', () => {
	describe('getBaseUrl', () => {
		it('returns the configured base URL', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings({ baseUrl: 'https://custom.example.com' }));
			expect(await core.getBaseUrl()).toBe('https://custom.example.com');
		});

		it('returns the default base URL when not overridden', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			expect(await core.getBaseUrl()).toBe('https://api.cinephage.net');
		});
	});

	describe('isEnabled', () => {
		it('reflects enabled=true from settings', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings({ enabled: true }));
			expect(await core.isEnabled()).toBe(true);
		});

		it('reflects enabled=false from settings', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings({ enabled: false }));
			expect(await core.isEnabled()).toBe(false);
		});
	});

	describe('getIdentity', () => {
		it('returns identity resolved from settings overrides and env', async () => {
			process.env.APP_VERSION = '2.0.0';
			process.env.APP_COMMIT = 'feedface';
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			const identity = await core.getIdentity();
			expect(identity.version).toBe('2.0.0');
			expect(identity.commit).toBe('feedface');
			expect(identity.isConfigured).toBe(true);
			delete process.env.APP_VERSION;
			delete process.env.APP_COMMIT;
		});

		it('uses overrides when set', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(
				createMockSettings({ versionOverride: '9.9.9', commitOverride: 'override' })
			);
			const identity = await core.getIdentity();
			expect(identity.version).toBe('9.9.9');
			expect(identity.commit).toBe('override');
			expect(identity.isConfigured).toBe(true);
		});

		it('reports not configured when commit cannot be resolved', async () => {
			delete process.env.APP_COMMIT;
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			const identity = await core.getIdentity();
			expect(identity.commit).toBeNull();
			expect(identity.isConfigured).toBe(false);
		});
	});

	describe('getAuthHeaders', () => {
		it('returns X-Cinephage-* headers when identity is configured', async () => {
			process.env.APP_VERSION = '2.0.0';
			process.env.APP_COMMIT = 'feedface';
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			const headers = await core.getAuthHeaders();
			expect(headers['X-Cinephage-Version']).toBe('2.0.0');
			expect(headers['X-Cinephage-Commit']).toBe('feedface');
			delete process.env.APP_VERSION;
			delete process.env.APP_COMMIT;
		});

		it('returns empty headers when commit is missing', async () => {
			delete process.env.APP_COMMIT;
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			const headers = await core.getAuthHeaders();
			expect(headers).toEqual({});
		});
	});

	describe('singleton', () => {
		it('getCinephageCore returns the same instance until reset', async () => {
			const { getCinephageCore, resetCinephageCore } = await import('./CinephageCore.js');
			const a = getCinephageCore();
			const b = getCinephageCore();
			expect(a).toBe(b);
			resetCinephageCore();
		});

		it('resetCinephageCore forces a new instance', async () => {
			const { getCinephageCore, resetCinephageCore } = await import('./CinephageCore.js');
			const a = getCinephageCore();
			resetCinephageCore();
			const b = getCinephageCore();
			expect(a).not.toBe(b);
			resetCinephageCore();
		});
	});

	describe('getHttpClient', () => {
		it('returns the underlying IndexerHttp instance', async () => {
			const { CinephageCore } = await import('./CinephageCore.js');
			const core = new CinephageCore(createMockSettings());
			const client = core.getHttpClient();
			expect(client).toBeTruthy();
			expect(typeof client.get).toBe('function');
		});
	});
});
