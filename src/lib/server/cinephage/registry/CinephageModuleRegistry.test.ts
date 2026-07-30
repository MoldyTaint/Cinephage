import { describe, it, expect, beforeEach } from 'vitest';
import { CinephageModuleRegistry } from './CinephageModuleRegistry.js';
import { BaseCinephageModule } from '../modules/BaseCinephageModule.js';
import type {
	CinephageModule,
	CinephageModuleCapabilities,
	CinephageModuleContext
} from '../modules/types.js';

const stubCtx: CinephageModuleContext = {
	getSubsystemConfig: async () => ({
		enabled: true,
		baseUrl: 'https://api.cinephage.net',
		versionOverride: null,
		commitOverride: null
	})
};

class StubModule extends BaseCinephageModule {
	readonly id: string;
	readonly name: string;
	readonly description = 'stub';
	readonly maturity = 'stable' as const;
	readonly capabilities: CinephageModuleCapabilities;
	initCalls = 0;
	destroyCalls = 0;

	constructor(
		id: string,
		name: string,
		opts: { capabilities?: CinephageModuleCapabilities; enabled?: boolean } = {}
	) {
		super();
		this.id = id;
		this.name = name;
		this.capabilities = opts.capabilities ?? {};
		if (opts.enabled !== undefined) {
			this.setEnabled(opts.enabled);
		}
	}

	async init(): Promise<void> {
		this.initCalls++;
	}

	async destroy(): Promise<void> {
		this.destroyCalls++;
	}
}

class FailingInitModule extends StubModule {
	constructor() {
		super('failing-init', 'Failing');
	}

	async init(): Promise<void> {
		throw new Error('init failed');
	}
}

describe('CinephageModuleRegistry', () => {
	let registry: CinephageModuleRegistry;

	beforeEach(() => {
		registry = new CinephageModuleRegistry();
	});

	describe('register', () => {
		it('stores a module accessible by id', () => {
			const mod = new StubModule('library-streaming', 'Library Streaming');
			registry.register(mod);
			expect(registry.getById('library-streaming')).toBe(mod);
		});

		it('replaces a module with the same id', () => {
			const mod1 = new StubModule('m1', 'One');
			const mod2 = new StubModule('m1', 'Two');
			registry.register(mod1);
			registry.register(mod2);
			expect(registry.getById('m1')?.name).toBe('Two');
		});

		it('exposes all registered modules via getAll()', () => {
			registry.register(new StubModule('a', 'A'));
			registry.register(new StubModule('b', 'B'));
			expect(
				registry
					.getAll()
					.map((m) => m.id)
					.sort()
			).toEqual(['a', 'b']);
		});
	});

	describe('getById', () => {
		it('returns undefined for unknown id', () => {
			expect(registry.getById('nope')).toBeUndefined();
		});
	});

	describe('getByCapability', () => {
		it('returns only modules advertising the capability', () => {
			registry.register(
				new StubModule('with-indexer', 'With', {
					capabilities: { providesIndexer: { definitionId: 'cinephage-stream' } }
				})
			);
			registry.register(new StubModule('without', 'Without'));
			const result = registry.getByCapability('providesIndexer');
			expect(result.map((m) => m.id)).toEqual(['with-indexer']);
		});

		it('returns empty array when no modules have the capability', () => {
			registry.register(new StubModule('plain', 'Plain'));
			expect(registry.getByCapability('providesIndexer')).toEqual([]);
		});
	});

	describe('getEnabledModules', () => {
		it('returns only modules whose isEnabled() returns true', () => {
			registry.register(new StubModule('on', 'On', { enabled: true }));
			registry.register(new StubModule('off', 'Off', { enabled: false }));
			const enabled = registry.getEnabledModules();
			expect(enabled.map((m) => m.id)).toEqual(['on']);
		});
	});

	describe('initializeAll', () => {
		it('calls init() on every registered module', async () => {
			const a = new StubModule('a', 'A');
			const b = new StubModule('b', 'B');
			registry.register(a);
			registry.register(b);
			await registry.initializeAll(stubCtx);
			expect(a.initCalls).toBe(1);
			expect(b.initCalls).toBe(1);
		});

		it('continues initializing other modules when one throws', async () => {
			const failing = new FailingInitModule();
			const ok = new StubModule('ok', 'OK');
			registry.register(failing);
			registry.register(ok);
			await registry.initializeAll(stubCtx);
			expect(ok.initCalls).toBe(1);
		});

		it('resolves even when a module init rejects', async () => {
			registry.register(new FailingInitModule());
			await expect(registry.initializeAll(stubCtx)).resolves.toBeUndefined();
		});
	});

	describe('destroyAll', () => {
		it('calls destroy() on every registered module', async () => {
			const a = new StubModule('a', 'A');
			const b = new StubModule('b', 'B');
			registry.register(a);
			registry.register(b);
			await registry.destroyAll();
			expect(a.destroyCalls).toBe(1);
			expect(b.destroyCalls).toBe(1);
		});

		it('continues destroying other modules when one throws', async () => {
			class FailingDestroy extends StubModule {
				async destroy(): Promise<void> {
					throw new Error('destroy failed');
				}
			}
			const failing = new FailingDestroy('failing-destroy', 'Failing');
			const ok = new StubModule('ok', 'OK');
			registry.register(failing);
			registry.register(ok);
			await registry.destroyAll();
			expect(ok.destroyCalls).toBe(1);
		});
	});

	describe('unregister', () => {
		it('removes a module from the registry', () => {
			const mod = new StubModule('a', 'A');
			registry.register(mod);
			registry.unregister('a');
			expect(registry.getById('a')).toBeUndefined();
		});

		it('is a no-op for unknown id', () => {
			expect(() => registry.unregister('nope')).not.toThrow();
		});
	});

	describe('type narrowing', () => {
		it('CinephageModule interface is satisfied by StubModule', () => {
			const mod: CinephageModule = new StubModule('test', 'Test');
			expect(mod.id).toBe('test');
		});
	});
});
