import { describe, expect, it, vi, afterEach } from 'vitest';
import { deflateSync, gzipSync } from 'node:zlib';
import { M3uProvider } from './M3uProvider';
import type { LiveTvAccount } from '$lib/types/livetv';

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
