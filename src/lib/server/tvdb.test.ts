import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Settings store the mock returns (key -> value). findFirst matches by scanning
// the `where` clause for the key literal — robust across drizzle internal
// shapes (which are circular, so not JSON-serialisable) without depending on them.
const settingsMap: Record<string, string> = {};

function collectStrings(obj: unknown, seen: Set<object> = new Set()): string[] {
	const out: string[] = [];
	if (obj == null || typeof obj !== 'object') return out;
	if (seen.has(obj as object)) return out;
	seen.add(obj as object);
	for (const value of Object.values(obj as Record<string, unknown>)) {
		if (typeof value === 'string') out.push(value);
		else if (typeof value === 'object') out.push(...collectStrings(value, seen));
	}
	return out;
}

const findFirstMock = vi.fn(async (opts?: { where?: unknown }) => {
	const leaves = collectStrings(opts?.where);
	for (const key of Object.keys(settingsMap)) {
		if (leaves.includes(key)) return { key, value: settingsMap[key] };
	}
	return undefined;
});

vi.mock('$lib/server/db', () => ({
	get db() {
		return { query: { settings: { findFirst: findFirstMock } } };
	},
	get sqlite() {
		return {};
	},
	initializeDatabase: vi.fn()
}));
vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

const fetchMock = vi.spyOn(globalThis, 'fetch') as unknown as ReturnType<typeof vi.fn>;

const { tvdb } = await import('./tvdb.js');

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		headers: new Headers(),
		json: async () => body as Record<string, unknown>,
		text: async () => JSON.stringify(body)
	} as Response;
}

const VALID_TOKEN = 'header.eyJ4IjoxfQ.signature'; // payload decodes, no exp -> 24h default

describe('tvdb client', () => {
	beforeEach(() => {
		for (const k of Object.keys(settingsMap)) delete settingsMap[k];
		fetchMock.mockReset();
		tvdb.invalidateSettings();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('reports configured only when an api key is present', async () => {
		expect(await tvdb.isConfigured()).toBe(false);
		settingsMap.tvdb_api_key = '566a93e6-e044-4a61-bde5-a5a39b651812';
		tvdb.invalidateSettings();
		expect(await tvdb.isConfigured()).toBe(true);
	});

	it('logs in, caches the token, and sends Authorization on subsequent calls', async () => {
		settingsMap.tvdb_api_key = 'key-123';
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			.mockResolvedValueOnce(
				jsonResponse({
					status: 'success',
					data: { episodes: [{ id: 1, seasonNumber: 1, number: 1, name: null }] },
					links: { next: null }
				})
			);

		const page = await tvdb.getEpisodePage(81189, 'official', 0);

		// First call = login (POST), second = authed GET
		const loginCall = fetchMock.mock.calls[0][1] as RequestInit;
		expect((loginCall.method as string) ?? 'GET').toBe('POST');
		expect(page.episodes).toHaveLength(1);
		expect(page.episodes[0].seasonNumber).toBe(1);
		expect(page.hasNext).toBe(false);

		const authedUrl = String(fetchMock.mock.calls[1][0]);
		expect(authedUrl).toContain('/series/81189/episodes/official/0');
		const authedHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
		expect(authedHeaders.Authorization).toBe(`Bearer ${VALID_TOKEN}`);
	});

	it('re-authenticates once on 401 then retries', async () => {
		settingsMap.tvdb_api_key = 'key-123';
		fetchMock
			// initial login
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			// first authed GET -> 401
			.mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401))
			// re-login
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			// retry authed GET -> ok
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: [] }));

		const data = (await tvdb.searchSeries('Firefly')) as unknown[];
		expect(Array.isArray(data)).toBe(true);
		expect(fetchMock.mock.calls).toHaveLength(4);
	});

	it('normalises links.next into hasNext', async () => {
		settingsMap.tvdb_api_key = 'key-123';
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			.mockResolvedValueOnce(
				jsonResponse({ status: 'success', data: { episodes: [] }, links: { next: 'url?page=1' } })
			);

		const page = await tvdb.getEpisodePage(1, 'official', 0);
		expect(page.hasNext).toBe(true);
	});

	it('fetches and normalises a single extended episode', async () => {
		settingsMap.tvdb_api_key = 'key-123';
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			.mockResolvedValueOnce(
				jsonResponse({
					status: 'success',
					data: {
						id: 3859781,
						name: 'Good Cop / Bad Cop',
						aired: '2009-02-17',
						runtime: 3,
						overview: 'A webisode.',
						seasonNumber: 0,
						number: 1
					}
				})
			);

		const ep = await tvdb.getEpisodeExtended(3859781);
		expect(ep?.name).toBe('Good Cop / Bad Cop');
		expect(ep?.seasonNumber).toBe(0);
		expect(ep?.runtime).toBe(3);
	});

	it('throws ConfigurationError when verifying credentials without a key', async () => {
		await expect(tvdb.verifyCredentials()).rejects.toThrow(/TVDB API key not configured/);
	});

	it('throws ExternalServiceError on a failed endpoint', async () => {
		settingsMap.tvdb_api_key = 'key-123';
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ status: 'success', data: { token: VALID_TOKEN } }))
			.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500));

		await expect(tvdb.searchSeries('Anything')).rejects.toThrow(/TVDB/);
	});

	it('invalidateSettings forces the next call to reload settings', async () => {
		expect(await tvdb.isConfigured()).toBe(false);
		settingsMap.tvdb_api_key = 'key-123';
		tvdb.invalidateSettings();
		expect(await tvdb.isConfigured()).toBe(true);
	});
});
