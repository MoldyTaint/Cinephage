import { describe, expect, it, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { deflateSync, gzipSync } from 'node:zlib';
import {
	createTestDb,
	destroyTestDb,
	type TestDatabase
} from '../../../../test/db-helper';
import { livetvAccounts, livetvChannels } from '$lib/server/db/schema';
import { M3uProvider } from './M3uProvider';
import type { LiveTvAccount } from '$lib/types/livetv';

/**
 * In-memory database backing the livetv channel lookups fetchEpg performs.
 * The mock defers access via getters so module import order stays simple.
 */
const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const TEST_PLAYLIST = '#EXTM3U\n#EXTINF:-1 tvg-id="news",News\nhttp://example.com/stream.m3u8\n';

function createTestAccount(epgUrl?: string): LiveTvAccount {
	return {
		id: 'test-account',
		name: 'Test M3U',
		providerType: 'm3u',
		enabled: true,
		m3uConfig: {
			fileContent: TEST_PLAYLIST,
			epgUrl
		},
		playbackLimit: null,
		channelCount: null,
		categoryCount: null,
		expiresAt: null,
		serverTimezone: null,
		lastTestedAt: null,
		lastTestSuccess: null,
		lastTestError: null,
		lastSyncAt: null,
		lastSyncError: null,
		syncStatus: 'never',
		lastEpgSyncAt: null,
		lastEpgSyncError: null,
		epgProgramCount: 0,
		hasEpg: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(() => {
	destroyTestDb(testDb);
});

// ============================================================================
// XMLTV @lang preservation (Phase 5 Task 3)
// ============================================================================

const MULTILANG_XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="c1"><display-name>News Channel</display-name></channel>
  <programme start="20260913000000 +0000" stop="20260913010000 +0000" channel="c1">
    <title lang="en">News</title>
    <title lang="fr">Informations</title>
    <desc>Plain first</desc>
    <desc lang="de">Beschreibung</desc>
    <category lang="en">Sports</category>
  </programme>
  <programme start="20260913010000 +0000" stop="20260913020000 +0000" channel="c1">
    <title>Only One</title>
    <desc>Untranslated desc</desc>
  </programme>
  <programme start="20260913020000 +0000" stop="20260913030000 +0000" channel="c1">
    <title lang="pt-BR">Jornal</title>
  </programme>
</tv>`;

describe('M3uProvider XMLTV @lang preservation', () => {
	beforeAll(() => {
		testDb.db
			.insert(livetvAccounts)
			.values({ id: 'test-account', name: 'Test M3U', providerType: 'm3u' })
			.run();
		testDb.db
			.insert(livetvChannels)
			.values({
				id: 'chan-1',
				accountId: 'test-account',
				providerType: 'm3u',
				externalId: 'c1',
				name: 'News Channel',
				m3uData: { tvgId: 'c1', url: 'http://example.com/stream.m3u8' }
			})
			.run();
	});

	async function fetchMultilangEpg() {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(MULTILANG_XMLTV, { headers: { 'content-type': 'application/xml' } })
		);
		const provider = new M3uProvider();
		return provider.fetchEpg(
			createTestAccount('https://example.com/epg.xml'),
			new Date('2026-09-12T00:00:00Z'),
			new Date('2026-09-14T00:00:00Z')
		);
	}

	it('keeps the plain columns at the pre-i18n first-element behavior', async () => {
		const programs = await fetchMultilangEpg();
		expect(programs).toHaveLength(3);

		const [multi, untranslated, singleLang] = programs;

		// Multi-language programme: the FIRST element wins for the plain columns.
		expect(multi.title).toBe('News');
		expect(multi.description).toBe('Plain first');
		expect(multi.category).toBe('Sports');

		// Untranslated programme: bare string elements parse as before.
		expect(untranslated.title).toBe('Only One');
		expect(untranslated.description).toBe('Untranslated desc');
		expect(untranslated.category).toBeNull();

		// Single element carrying a lang attribute still resolves via #text.
		expect(singleLang.title).toBe('Jornal');
		expect(singleLang.description).toBeNull();
		expect(singleLang.category).toBeNull();
	});

	it('stores the complete per-language variant lists', async () => {
		const programs = await fetchMultilangEpg();
		const [multi, untranslated, singleLang] = programs;

		expect(multi.titleI18n).toEqual([
			{ lang: 'en', text: 'News' },
			{ lang: 'fr', text: 'Informations' }
		]);
		expect(multi.descriptionI18n).toEqual([
			{ lang: null, text: 'Plain first' },
			{ lang: 'de', text: 'Beschreibung' }
		]);
		expect(multi.categoryI18n).toEqual([{ lang: 'en', text: 'Sports' }]);

		// Untranslated elements are preserved as lang-less entries.
		expect(untranslated.titleI18n).toEqual([{ lang: null, text: 'Only One' }]);
		expect(untranslated.descriptionI18n).toEqual([{ lang: null, text: 'Untranslated desc' }]);
		expect(untranslated.categoryI18n).toBeNull();

		// lang attributes are lower-cased.
		expect(singleLang.titleI18n).toEqual([{ lang: 'pt-br', text: 'Jornal' }]);
	});
});

describe('M3uProvider XMLTV compression handling', () => {
	it('reads gzipped XMLTV from .xml.gz URLs', async () => {
		const provider = new M3uProvider();
		const xml = '<?xml version="1.0" encoding="UTF-8"?><tv></tv>';
		const gzipped = gzipSync(Buffer.from(xml, 'utf-8'));
		const response = new Response(gzipped, {
			headers: {
				'content-type': 'application/octet-stream'
			}
		});

		// @ts-expect-error accessing private method for testing
		const parsed = await provider.readXmltvContent(
			response,
			'https://epgshare01.online/epgshare01/epg_ripper_NL1.xml.gz'
		);

		expect(parsed).toContain('<tv>');
	});

	it('handles plain XML even when URL ends with .gz', async () => {
		const provider = new M3uProvider();
		const xml = '<?xml version="1.0" encoding="UTF-8"?><tv></tv>';
		const response = new Response(xml, {
			headers: {
				'content-type': 'application/xml'
			}
		});

		// @ts-expect-error accessing private method for testing
		const parsed = await provider.readXmltvContent(response, 'https://example.com/guide.xml.gz');

		expect(parsed).toContain('<tv>');
	});

	it('supports deflate-compressed XMLTV payloads', async () => {
		const provider = new M3uProvider();
		const xml = '<?xml version="1.0" encoding="UTF-8"?><tv></tv>';
		const deflated = deflateSync(Buffer.from(xml, 'utf-8'));
		const response = new Response(deflated, {
			headers: {
				'content-encoding': 'deflate',
				'content-type': 'application/xml'
			}
		});

		// @ts-expect-error accessing private method for testing
		const parsed = await provider.readXmltvContent(response, 'https://example.com/guide.xml');

		expect(parsed).toContain('<tv>');
	});

	it('reads gzipped XMLTV payloads that include a DOCTYPE declaration', async () => {
		const provider = new M3uProvider();
		const xml =
			'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv><channel id="c1" /></tv>';
		const gzipped = gzipSync(Buffer.from(xml, 'utf-8'));
		const response = new Response(gzipped, {
			headers: {
				'content-type': 'application/octet-stream'
			}
		});

		// @ts-expect-error accessing private method for testing
		const parsed = await provider.readXmltvContent(response, 'https://example.com/guide.xml.gz');

		expect(parsed).toContain('<!DOCTYPE tv SYSTEM "xmltv.dtd">');
		expect(parsed).toContain('<tv>');
	});
});

describe('M3uProvider testConnection EPG checks', () => {
	it('reports EPG as reachable when XMLTV can be fetched', async () => {
		const provider = new M3uProvider();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('<?xml version="1.0" encoding="UTF-8"?><tv><channel id="c1" /></tv>', {
				headers: {
					'content-type': 'application/xml'
				}
			})
		);

		const result = await provider.testConnection(createTestAccount('https://example.com/epg.xml'));

		expect(result.success).toBe(true);
		expect(result.profile?.epg?.status).toBe('reachable');
		expect(result.profile?.epg?.source).toBe('configured');
	});

	it('reports EPG as unreachable when XMLTV fetch fails', async () => {
		const provider = new M3uProvider();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('Not found', {
				status: 404
			})
		);

		const result = await provider.testConnection(createTestAccount('https://example.com/epg.xml'));

		expect(result.success).toBe(true);
		expect(result.profile?.epg?.status).toBe('unreachable');
		expect(result.profile?.epg?.error).toContain('HTTP 404');
	});

	it('reports EPG as not configured when no EPG URL is available', async () => {
		const provider = new M3uProvider();

		const result = await provider.testConnection(createTestAccount());

		expect(result.success).toBe(true);
		expect(result.profile?.epg?.status).toBe('not_configured');
	});
});
