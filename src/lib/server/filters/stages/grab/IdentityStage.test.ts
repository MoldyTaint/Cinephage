import { describe, expect, it } from 'vitest';
import { IdentityStage } from './IdentityStage.js';
import { makeGrabDecisionContext } from '../../../../../test/fixtures/filters.js';

describe('IdentityStage', () => {
	const stage = new IdentityStage();

	const movieInfo = {
		mediaType: 'movie' as const,
		titles: ['Halloween'],
		year: 1978
	};

	const seriesInfo = {
		mediaType: 'tv' as const,
		titles: ['Detective Conan'],
		year: 1996
	};

	it('is a hard stage: enabled regardless of force or manual source', () => {
		expect(stage.isEnabled(makeGrabDecisionContext({ targetInfo: movieInfo }))).toBe(true);
		expect(
			stage.isEnabled(
				makeGrabDecisionContext({
					targetInfo: movieInfo,
					options: { force: true, skipBlocklist: false, allowSidegrade: false, isAutomatic: false }
				})
			)
		).toBe(true);
	});

	it('is disabled when target info was not resolved', () => {
		expect(stage.isEnabled(makeGrabDecisionContext())).toBe(false);
	});

	it('accepts a matching movie release', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: { title: 'Halloween.1978.1080p.BluRay.x264', protocol: 'torrent' }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(true);
	});

	// The 2026-09-17 wrong-target incident.
	it('rejects Detective Conan: The Bride of Halloween grabbed for Halloween', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: {
				title: 'Detective.Conan.The.Bride.of.Halloween.2022.1080p.BDRip.x264',
				protocol: 'torrent'
			}
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
		expect(result.details?.rejectionType).toBe('identity_mismatch');
	});

	it('rejects a manual grab of the wrong movie (identity is not overridable)', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: { title: 'Halloween.II.1981.1080p', protocol: 'torrent' },
			options: { force: true, skipBlocklist: false, allowSidegrade: false, isAutomatic: false }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
	});

	it('rejects automatic movie grabs without year evidence', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: { title: 'Halloween.1080p.BluRay.x264-GROUP', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
		expect(result.details?.matchReason).toBe('no_year_evidence');
	});

	it('allows interactive movie grabs without year evidence', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: { title: 'Halloween.1080p.BluRay.x264-GROUP', protocol: 'torrent' },
			options: { force: true, skipBlocklist: false, allowSidegrade: false, isAutomatic: false }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(true);
	});

	it('rejects on year mismatch for movies', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: movieInfo,
			release: { title: 'Halloween.2018.1080p.WEB-DL', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
	});

	it('matches against alternate titles', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: { ...seriesInfo, titles: ['Detective Conan', 'Case Closed'] },
			release: { title: 'Case.Closed.1996.S01E01.720p', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(true);
	});

	it('accepts TV releases with air years far past the series first-air year', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: {
				...seriesInfo,
				seasonNumber: 1,
				episodeScope: [{ seasonNumber: 1, episodeNumber: 5 }]
			},
			release: { title: 'Detective.Conan.2022.S01E05.1080p', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(true);
	});

	it('rejects TV releases from the wrong season', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: { ...seriesInfo, seasonNumber: 2 },
			release: { title: 'Detective.Conan.2022.S01E05.1080p', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
		expect(result.details?.matchReason).toBe('season_scope_mismatch');
	});

	it('rejects single-episode releases outside the episode scope', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: {
				...seriesInfo,
				seasonNumber: 1,
				episodeScope: [{ seasonNumber: 1, episodeNumber: 5 }]
			},
			release: { title: 'Detective.Conan.2022.S01E09.1080p', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(false);
		expect(result.details?.matchReason).toBe('episode_scope_mismatch');
	});

	it('accepts season packs covering the episode scope', async () => {
		const ctx = makeGrabDecisionContext({
			targetInfo: {
				...seriesInfo,
				seasonNumber: 1,
				episodeScope: [{ seasonNumber: 1, episodeNumber: 5 }]
			},
			release: { title: 'Detective.Conan.2022.S01.1080p.COMPLETE', protocol: 'torrent' },
			options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true }
		});
		const result = await stage.evaluate(ctx);
		expect(result.accepted).toBe(true);
	});
});
