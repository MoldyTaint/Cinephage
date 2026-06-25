/**
 * Live TheTVDB integration test.
 *
 * Hits the real TVDB v4 API to verify the client (login, search, episode list,
 * per-episode extended). Gated so it never runs in CI without opt-in.
 *
 * Run:
 *   LIVE_TESTS=true TVDB_LIVE_API_KEY=<your-key> \
 *     npx vitest run src/lib/server/tvdb.live.test.ts
 *
 * Optional: TVDB_LIVE_PIN for user-supported (subscriber) keys.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const apiKey = process.env.TVDB_LIVE_API_KEY ?? '';
const pin = process.env.TVDB_LIVE_PIN ?? '';

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

vi.mock('$lib/server/db', () => ({
	get db() {
		return {
			query: {
				settings: {
					findFirst: async (opts?: { where?: unknown }) => {
						const leaves = collectStrings(opts?.where);
						if (leaves.includes('tvdb_api_pin')) {
							return pin ? { key: 'tvdb_api_pin', value: pin } : undefined;
						}
						return apiKey ? { key: 'tvdb_api_key', value: apiKey } : undefined;
					}
				}
			}
		};
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

const { tvdb } = await import('./tvdb.js');

// Breaking Bad on TVDB
const BREAKING_BAD_TVDB_ID = 81189;

describe.skipIf(!process.env.LIVE_TESTS || !process.env.TVDB_LIVE_API_KEY)('TVDB live API', () => {
	beforeAll(async () => {
		// Force a real login once before the suite
		await tvdb.verifyCredentials();
	});

	it('authenticates with the configured key', async () => {
		expect(await tvdb.isConfigured()).toBe(true);
		expect(await tvdb.verifyCredentials()).toBe(true);
	});

	it('searches series by name', async () => {
		const results = await tvdb.searchSeries('Breaking Bad');
		expect(results.length).toBeGreaterThan(0);
		expect(results.some((r) => /breaking bad/i.test(r.name))).toBe(true);
	});

	it('returns aired-order episodes with populated air dates from the list endpoint', async () => {
		const page = await tvdb.getEpisodePage(BREAKING_BAD_TVDB_ID, 'official', 0);
		expect(page.episodes.length).toBeGreaterThan(0);
		// The list endpoint must surface aired/runtime even though name/overview are null
		expect(page.episodes.filter((e) => e.aired).length).toBeGreaterThan(0);
	});

	it('resolves episode text via the per-episode extended endpoint', async () => {
		const page = await tvdb.getEpisodePage(BREAKING_BAD_TVDB_ID, 'official', 0);
		const withId = page.episodes.find((e) => e.id > 0);
		expect(withId).toBeTruthy();

		const detail = await tvdb.getEpisodeExtended(withId!.id);
		expect(detail).not.toBeNull();
		// Extended must populate the text fields the list endpoint leaves null
		expect(detail?.name).toBeTruthy();
		expect(detail?.overview).toBeTruthy();
	});
});
