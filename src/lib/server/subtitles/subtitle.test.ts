/**
 * Subtitle.toSearchResult payload tests.
 *
 * The legacy search-result payload must carry the provider download URL (and
 * the page link) so the interactive download route can forward them.
 */

import { describe, it, expect } from 'vitest';
import { GenericSubtitle } from './subtitle';
import { Language } from './language';

function makeSubtitle(options: ConstructorParameters<typeof GenericSubtitle>[3] = {}) {
	return new GenericSubtitle('testprovider', 'sub-1', new Language('en'), options);
}

describe('GenericSubtitle.toSearchResult', () => {
	it('prefers an explicit downloadUrl and preserves pageLink', () => {
		const result = makeSubtitle({
			pageLink: 'https://provider.test/page/1',
			downloadUrl: 'https://provider.test/download/1',
			releaseInfo: 'Movie.2024.1080p'
		}).toSearchResult();

		expect(result.downloadUrl).toBe('https://provider.test/download/1');
		expect(result.pageLink).toBe('https://provider.test/page/1');
	});

	it('falls back downloadUrl to pageLink when no explicit URL is set', () => {
		const result = makeSubtitle({
			pageLink: 'https://provider.test/page/1'
		}).toSearchResult();

		expect(result.downloadUrl).toBe('https://provider.test/page/1');
		expect(result.pageLink).toBe('https://provider.test/page/1');
	});

	it('includes the fields the manual download path needs', () => {
		const result = makeSubtitle({
			releaseInfo: 'Movie.2024.1080p',
			filename: 'Movie.2024.1080p.srt',
			format: 'ass',
			downloadCount: 12
		}).toSearchResult();

		expect(result).toMatchObject({
			providerId: 'testprovider',
			providerName: 'testprovider',
			providerSubtitleId: 'sub-1',
			language: 'en',
			releaseName: 'Movie.2024.1080p',
			fileName: 'Movie.2024.1080p.srt',
			format: 'ass',
			isForced: false,
			isHearingImpaired: false,
			isHashMatch: false,
			matchScore: 0,
			downloadCount: 12
		});
	});
});
