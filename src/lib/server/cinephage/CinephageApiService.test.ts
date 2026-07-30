import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CinephageSettingsService } from './settings/CinephageSettingsService.js';
import type { CinephageCore } from './core/CinephageCore.js';
import type { CinephageModuleRegistry } from './registry/CinephageModuleRegistry.js';
import type { CinephageModuleContext } from './modules/types.js';

function createMockSettings(): CinephageSettingsService {
	return {
		getConfig: vi.fn().mockResolvedValue({
			enabled: true,
			baseUrl: 'https://api.cinephage.net',
			versionOverride: null,
			commitOverride: null
		}),
		getModuleConfig: vi.fn().mockResolvedValue({
			moduleId: 'stub',
			enabled: true,
			settings: {},
			lastError: null
		}),
		updateConfig: vi.fn(),
		setModuleEnabled: vi.fn(),
		updateModuleSettings: vi.fn(),
		recordModuleError: vi.fn(),
		clearModuleError: vi.fn()
	} as unknown as CinephageSettingsService;
}

function createMockCore(): CinephageCore {
	return {
		isEnabled: vi.fn().mockResolvedValue(true),
		getBaseUrl: vi.fn().mockResolvedValue('https://api.cinephage.net'),
		getIdentity: vi.fn().mockResolvedValue({ version: 'v1', commit: 'c1', isConfigured: true }),
		getAuthHeaders: vi.fn().mockResolvedValue({
			'X-Cinephage-Version': 'v1',
			'X-Cinephage-Commit': 'c1'
		}),
		getHttpClient: vi.fn()
	} as unknown as CinephageCore;
}

function createMockRegistry(): CinephageModuleRegistry {
	return {
		register: vi.fn(),
		unregister: vi.fn(),
		getById: vi.fn(),
		getAll: vi.fn().mockReturnValue([]),
		getByCapability: vi.fn().mockReturnValue([]),
		getEnabledModules: vi.fn().mockReturnValue([]),
		initializeAll: vi.fn().mockResolvedValue(undefined),
		destroyAll: vi.fn().mockResolvedValue(undefined)
	} as unknown as CinephageModuleRegistry;
}

describe('CinephageApiService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('BackgroundService contract', () => {
		it('has name "cinephage-api"', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const service = new CinephageApiService(
				createMockSettings(),
				createMockCore(),
				createMockRegistry()
			);
			expect(service.name).toBe('cinephage-api');
		});

		it('starts in pending status', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const service = new CinephageApiService(
				createMockSettings(),
				createMockCore(),
				createMockRegistry()
			);
			expect(service.status).toBe('pending');
		});

		it('start() returns immediately and defers real work', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const registry = createMockRegistry();
			const service = new CinephageApiService(createMockSettings(), createMockCore(), registry);
			service.start();
			// Per BackgroundService contract: start() returns synchronously
			// before async initialization completes.
			expect(service.status).toBe('starting');
			expect(registry.initializeAll).not.toHaveBeenCalled();
		});

		it('reaches ready status after the deferred init completes', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const registry = createMockRegistry();
			const service = new CinephageApiService(createMockSettings(), createMockCore(), registry);
			service.start();
			await vi.advanceTimersByTimeAsync(0);
			expect(service.status).toBe('ready');
			expect(registry.initializeAll).toHaveBeenCalledTimes(1);
		});

		it('reports error status when init throws', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const registry = createMockRegistry();
			(registry.initializeAll as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('init boom')
			);
			const service = new CinephageApiService(createMockSettings(), createMockCore(), registry);
			service.start();
			await vi.advanceTimersByTimeAsync(0);
			expect(service.status).toBe('error');
			expect(service.error?.message).toBe('init boom');
		});

		it('stop() calls destroyAll and resolves', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const registry = createMockRegistry();
			const service = new CinephageApiService(createMockSettings(), createMockCore(), registry);
			await service.stop();
			expect(registry.destroyAll).toHaveBeenCalledTimes(1);
		});
	});

	describe('module context propagation', () => {
		it('passes a getSubsystemConfig function to module init', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const settings = createMockSettings();
			const capturedCtx: CinephageModuleContext[] = [];
			const registry = createMockRegistry();
			(registry.initializeAll as ReturnType<typeof vi.fn>).mockImplementationOnce(
				async (ctx: CinephageModuleContext) => {
					capturedCtx.push(ctx);
				}
			);
			const service = new CinephageApiService(settings, createMockCore(), registry);
			service.start();
			await vi.advanceTimersByTimeAsync(0);

			expect(capturedCtx).toHaveLength(1);
			const config = await capturedCtx[0].getSubsystemConfig();
			expect(config.enabled).toBe(true);
			expect(config.baseUrl).toBe('https://api.cinephage.net');
		});
	});

	describe('with real registry (integration smoke)', () => {
		it('initializes registered modules through the real registry', async () => {
			const { CinephageApiService } = await import('./CinephageApiService.js');
			const { CinephageModuleRegistry } = await import('./registry/CinephageModuleRegistry.js');
			const { BaseCinephageModule } = await import('./modules/BaseCinephageModule.js');

			const initSpy = vi.fn();
			class TestModule extends BaseCinephageModule {
				readonly id = 'test';
				readonly name = 'Test';
				readonly description = 'test module';
				readonly maturity = 'stable' as const;
				readonly capabilities = {};
				async init() {
					initSpy();
				}
			}

			const realRegistry = new CinephageModuleRegistry();
			realRegistry.register(new TestModule());
			const service = new CinephageApiService(createMockSettings(), createMockCore(), realRegistry);
			service.start();
			await vi.advanceTimersByTimeAsync(0);
			expect(initSpy).toHaveBeenCalledTimes(1);
		});
	});
});
