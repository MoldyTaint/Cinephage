import { describe, expect, it } from 'vitest';
import { analyzeReleaseMetadata } from './release-metadata-backfill';

describe('release metadata backfill heuristics', () => {
	it('prefers current filename when sceneName mismatches sequel/year', () => {
		const analysis = analyzeReleaseMetadata({
			currentFileName: 'Ant-Man (2015) [WEBRip-1080p][x265]-RARBG.mp4',
			actualTitle: 'Ant-Man',
			actualYear: 2015,
			sceneName: 'Ant-Man and the Wasp Quantumania 2023 1080p WEBRip x265-RARBG'
		});

		expect(analysis.preferredSource).toBe('currentFilename');
		expect(analysis.sceneNameLooksSuspicious).toBe(true);
		expect(analysis.riskLevel).toBe('high');
		expect(analysis.issues).toContain('scene_year_mismatch');
		expect(analysis.issues).toContain('prefer_current_filename');
	});

	it('backfills edition from current filename when missing', () => {
		const analysis = analyzeReleaseMetadata({
			currentFileName: 'Ted (2012) edition-Unrated [Bluray-1080p][x265]-RARBG.mp4',
			actualTitle: 'Ted',
			actualYear: 2012,
			sceneName: 'Ted 2012 UNRATED 1080p BluRay x265-RARBG',
			existingEdition: null
		});

		expect(analysis.inferredEdition).toBe('Unrated');
		expect(analysis.shouldBackfillEdition).toBe(true);
	});

	it('backfills release group only when missing', () => {
		const analysis = analyzeReleaseMetadata({
			currentFileName: 'Doctor Strange (2016) edition-IMAX [WEBRip-1080p][x265]-RARBG.mp4',
			actualTitle: 'Doctor Strange',
			actualYear: 2016,
			sceneName: 'Doctor Strange in the Multiverse of Madness 2022 IMAX 1080p WEBRip x265-RARBG',
			existingReleaseGroup: null
		});

		expect(analysis.inferredReleaseGroup).toBe('RARBG');
		expect(analysis.shouldBackfillReleaseGroup).toBe(true);
	});

	it('does not backfill suspicious release groups from file names', () => {
		const analysis = analyzeReleaseMetadata({
			currentFileName: 'The Shawshank Redemption (1994) [AAC 2.0]-Redemption.strm',
			actualTitle: 'The Shawshank Redemption',
			actualYear: 1994,
			sceneName: 'The Shawshank Redemption',
			existingReleaseGroup: null
		});

		expect(analysis.inferredReleaseGroup).toBe('Redemption');
		expect(analysis.releaseGroupLooksSuspicious).toBe(true);
		expect(analysis.shouldBackfillReleaseGroup).toBe(false);
		expect(analysis.riskLevel).toBe('high');
	});

	it('does not overwrite existing structured data', () => {
		const analysis = analyzeReleaseMetadata({
			currentFileName: 'Movie (2024) edition-IMAX [WEB-DL-1080p][x265]-GROUP.mkv',
			actualTitle: 'Movie',
			actualYear: 2024,
			existingEdition: 'IMAX',
			existingReleaseGroup: 'GROUP'
		});

		expect(analysis.shouldBackfillEdition).toBe(false);
		expect(analysis.shouldBackfillReleaseGroup).toBe(false);
		expect(analysis.riskLevel).toBe('low');
	});
});
