import { describe, it, expect } from 'vitest';
import {
	BaseSubtitleProvider,
	DEFAULT_CAPABILITIES,
	type ProviderCapabilities
} from './BaseProvider';
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	SubtitleProviderConfig,
	ProviderSearchOptions,
	LanguageCode
} from '../types';
import type { ProviderTestResult } from './interfaces';

/** Minimal concrete provider for exercising the base class. */
class TestProvider extends BaseSubtitleProvider {
	readonly supported: LanguageCode[];

	constructor(
		supported: LanguageCode[],
		overrides: Partial<SubtitleProviderConfig> = {},
		capabilities?: Partial<ProviderCapabilities>
	) {
		super({
			id: 'test-provider',
			name: 'Test Provider',
			implementation: 'opensubtitles',
			enabled: true,
			priority: 25,
			requestsPerMinute: 60,
			consecutiveFailures: 0,
			...overrides
		});
		this.supported = supported;
		if (capabilities) {
			this._capabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
		}
	}

	get implementation(): string {
		return 'opensubtitles';
	}

	get supportedLanguages(): LanguageCode[] {
		return this.supported;
	}

	get supportsHashSearch(): boolean {
		return false;
	}

	async search(
		_criteria: SubtitleSearchCriteria,
		_options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]> {
		return [];
	}

	async download(_result: SubtitleSearchResult): Promise<Buffer> {
		return Buffer.from('');
	}

	async test(): Promise<ProviderTestResult> {
		return { success: true, message: 'ok', responseTime: 0 };
	}
}

function criteria(languages: string[], extra: Partial<SubtitleSearchCriteria> = {}) {
	return {
		title: 'Some Movie',
		languages: languages as LanguageCode[],
		...extra
	} as SubtitleSearchCriteria;
}

describe('BaseSubtitleProvider.canSearch language semantics', () => {
	it('accepts a base-only supported language for a regional requirement (pt serves pt-BR)', () => {
		const provider = new TestProvider(['pt']);
		expect(provider.canSearch(criteria(['pt-BR']))).toBe(true);
	});

	it('accepts a regional supported language for a base requirement (pt-BR serves pt)', () => {
		const provider = new TestProvider(['pt-BR']);
		expect(provider.canSearch(criteria(['pt']))).toBe(true);
	});

	it('rejects disjoint regions (pt-BR provider vs pt-PT requirement)', () => {
		const provider = new TestProvider(['pt-BR']);
		expect(provider.canSearch(criteria(['pt-PT']))).toBe(false);
	});

	it('rejects disjoint scripts (zh-Hans provider vs zh-Hant requirement)', () => {
		const provider = new TestProvider(['zh-Hans']);
		expect(provider.canSearch(criteria(['zh-Hant']))).toBe(false);
	});

	it('still requires a title or hash to search', () => {
		const provider = new TestProvider(['en']);
		expect(provider.canSearch({ languages: ['en'] } as SubtitleSearchCriteria)).toBe(false);
		expect(
			provider.canSearch({ title: 'T', videoHash: 'abc', languages: ['en'] } as SubtitleSearchCriteria)
		).toBe(true);
	});
});

describe('BaseSubtitleProvider capabilities and priority', () => {
	it('exposes default capabilities and priority', () => {
		const provider = new TestProvider(['en']);
		expect(provider.capabilities).toEqual(DEFAULT_CAPABILITIES);
		expect(provider.priority).toBe(25);
	});

	it('exposes overridden capabilities and configured priority', () => {
		const provider = new TestProvider(['zh'], { priority: 7 }, {
			supportsAnime: true,
			hearingImpairedVerifiable: true,
			hashVerifiable: true
		});
		expect(provider.capabilities.supportsAnime).toBe(true);
		expect(provider.capabilities.hearingImpairedVerifiable).toBe(true);
		expect(provider.capabilities.hashVerifiable).toBe(true);
		expect(provider.priority).toBe(7);
	});
});
