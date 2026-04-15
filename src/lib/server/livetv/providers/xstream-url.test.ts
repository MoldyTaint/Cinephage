import { describe, expect, it } from 'vitest';
import { buildXstreamPlayerApiUrl, normalizeXstreamBaseUrl } from './xstream-url.js';

describe('normalizeXstreamBaseUrl', () => {
	it('strips get.php endpoint input', () => {
		expect(normalizeXstreamBaseUrl('http://ky-tv.cc:80/get.php?')).toBe('http://ky-tv.cc');
	});

	it('strips xmltv.php endpoint input', () => {
		expect(normalizeXstreamBaseUrl('http://ky-tv.cc:80/xmltv.php?')).toBe('http://ky-tv.cc');
	});

	it('preserves panel base paths while stripping endpoint files', () => {
		expect(normalizeXstreamBaseUrl('http://example.com/panel/get.php?username=test')).toBe(
			'http://example.com/panel'
		);
	});
});

describe('buildXstreamPlayerApiUrl', () => {
	it('prevents endpoint doubling when input already contains get.php', () => {
		const url = buildXstreamPlayerApiUrl(
			{
				baseUrl: 'http://ky-tv.cc:80/get.php?',
				username: 'user',
				password: 'pass'
			},
			{ action: 'get_live_categories' }
		);

		expect(url).toContain('/player_api.php?');
		expect(url).not.toContain('get.php?/player_api.php');
		expect(url).toContain('username=user');
		expect(url).toContain('password=pass');
		expect(url).toContain('action=get_live_categories');
	});
});
