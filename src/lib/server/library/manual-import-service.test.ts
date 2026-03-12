import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseRelease } from '$lib/server/indexers/parser/ReleaseParser.js';
import { manualImportService } from './manual-import-service.js';
import { NamingService, type MediaNamingInfo } from './naming/NamingService.js';

describe('ManualImportService naming', () => {
	it('preserves explicit season and episode overrides when parsed release lacks S/E markers', () => {
		const parsed = parseRelease('[Horse] Aggressive Retsuko - 003');
		const namingInfoBase: MediaNamingInfo = {
			title: 'Aggressive Retsuko',
			year: 2016,
			tmdbId: 70956,
			seasonNumber: 1,
			episodeNumbers: [3],
			episodeTitle: 'Shachiku no Uta'
		};

		const namingInfo = (manualImportService as any).enrichNamingInfo(
			namingInfoBase,
			parsed,
			'/tmp/[Horse] Aggressive Retsuko - 003.mkv.strm',
			null
		) as MediaNamingInfo;

		expect(namingInfo.seasonNumber).toBe(1);
		expect(namingInfo.episodeNumbers).toEqual([3]);
		expect(namingInfo.episodeTitle).toBe('Shachiku no Uta');

		const fileName = new NamingService().generateEpisodeFileName(namingInfo);
		expect(fileName).toContain('S01E03');
	});

	it('builds episode destination paths from the active naming service', () => {
		const service = manualImportService as unknown as {
			buildEpisodeDestinationPath: (
				rootFolderPath: string,
				seriesFolderName: string,
				useSeasonFolders: boolean,
				seasonNumber: number,
				namingInfo: MediaNamingInfo,
				sourceExtension: string
			) => string;
			namingService: Pick<NamingService, 'generateEpisodeFileName' | 'generateSeasonFolderName'>;
		};

		service.namingService = {
			generateEpisodeFileName: () => 'Episode 05.custom.mkv',
			generateSeasonFolderName: () => 'Collection 02'
		} as Pick<NamingService, 'generateEpisodeFileName' | 'generateSeasonFolderName'>;

		expect(
			service.buildEpisodeDestinationPath(
				'/library/tv',
				'Show Name',
				true,
				2,
				{ title: 'Show Name', seasonNumber: 2, episodeNumbers: [5] },
				'.mkv'
			)
		).toBe(join('/library/tv', 'Show Name', 'Collection 02', 'Episode 05.custom.mkv'));

		expect(
			service.buildEpisodeDestinationPath(
				'/library/tv',
				'Show Name',
				false,
				2,
				{ title: 'Show Name', seasonNumber: 2, episodeNumbers: [5] },
				'.mkv'
			)
		).toBe(join('/library/tv', 'Show Name', 'Episode 05.custom.mkv'));
	});
});
