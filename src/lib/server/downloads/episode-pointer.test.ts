import { describe, expect, it } from 'vitest';
import {
	buildEpisodePointerFileSelectionFromPaths,
	parseEpisodePointerFromGuid,
	parseEpisodePointerFromTitle
} from './episode-pointer.js';

describe('episode-pointer', () => {
	it('parses human-readable pointer title prefix', () => {
		const parsed = parseEpisodePointerFromTitle(
			'Season 1 Episode 8 - Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]'
		);

		expect(parsed).toEqual({
			season: 1,
			episode: 8,
			token: 'S01E08'
		});
	});

	it('parses pointer token from title suffix', () => {
		const parsed = parseEpisodePointerFromTitle(
			'Stranger Things / S2E01-10 [Episode Pointer S02E01]'
		);

		expect(parsed).toEqual({
			season: 2,
			episode: 1,
			token: 'S02E01'
		});
	});

	it('parses pointer token from guid suffix', () => {
		const parsed = parseEpisodePointerFromGuid(
			'https://rutracker.org/forum/viewtopic.php?t=123::episode-pointer::s02e01'
		);

		expect(parsed).toEqual({
			season: 2,
			episode: 1,
			token: 'S02E01'
		});
	});

	it('matches a single target episode inside a season pack', () => {
		const target = { season: 2, episode: 1, token: 'S02E01' };
		const selection = buildEpisodePointerFileSelectionFromPaths(
			[
				'Stranger.Things.S02E01.1080p.WEB-DL.mkv',
				'Stranger.Things.S02E02.1080p.WEB-DL.mkv',
				'Stranger.Things.S02E03.1080p.WEB-DL.mkv'
			],
			target
		);

		expect(selection.fileIndices).toEqual([0]);
		expect(selection.allFileIndices).toEqual([0, 1, 2]);
		expect(selection.filePaths).toEqual(['Stranger.Things.S02E01.1080p.WEB-DL.mkv']);
	});

	it('matches episode by season-folder + numeric filename fallback', () => {
		const target = { season: 2, episode: 3, token: 'S02E03' };
		const selection = buildEpisodePointerFileSelectionFromPaths(
			[
				'Season 2/01 - Chapter One.mkv',
				'Season 2/02 - Chapter Two.mkv',
				'Season 2/03 - Chapter Three.mkv'
			],
			target
		);

		expect(selection.fileIndices).toEqual([2]);
		expect(selection.allFileIndices).toEqual([0, 1, 2]);
		expect(selection.filePaths).toEqual(['Season 2/03 - Chapter Three.mkv']);
	});
});
