import { describe, it, expect } from 'vitest';
import { aggregateMovieRows, type MovieJoinedRow } from './aggregate-movies.js';

const movieRow = (overrides: Partial<MovieJoinedRow> & { id: string }): MovieJoinedRow => ({
	tmdbId: 0,
	title: 'Untitled',
	year: null,
	libraryId: null,
	rootFolderId: null,
	monitored: true,
	hasFile: false,
	added: null,
	posterPath: null,
	fileId: null,
	fileSize: null,
	quality: null,
	mediaInfo: null,
	relativePath: null,
	...overrides
});

describe('aggregateMovieRows', () => {
	it('sums sizes and keeps the best file quality for a multi-quality movie', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({
				id: 'm1',
				title: 'Dune',
				fileId: 'f1',
				fileSize: 6000,
				quality: { resolution: '2160p' },
				mediaInfo: { videoCodec: 'hevc' },
				relativePath: 'Dune.2160p.mkv'
			}),
			movieRow({
				id: 'm1',
				title: 'Dune',
				fileId: 'f2',
				fileSize: 3000,
				quality: { resolution: '1080p' },
				mediaInfo: { videoCodec: 'h264' },
				relativePath: 'Dune.1080p.mkv'
			})
		];

		const result = aggregateMovieRows(rows);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('m1');
		expect(result[0].totalFileSize).toBe(9000);
		expect((result[0].bestQuality as { resolution?: string })?.resolution).toBe('2160p');
		expect(result[0].bestMediaInfo).toEqual({ videoCodec: 'hevc' });
	});

	it('returns the single file quality and size for a movie with one file', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({
				id: 'm1',
				title: 'Solo',
				fileId: 'f1',
				fileSize: 4096,
				quality: { resolution: '1080p' },
				mediaInfo: { videoCodec: 'h264' },
				relativePath: 'solo.mkv'
			})
		];

		const result = aggregateMovieRows(rows);

		expect(result).toHaveLength(1);
		expect(result[0].totalFileSize).toBe(4096);
		expect(result[0].bestQuality?.resolution).toBe('1080p');
		expect(result[0].bestMediaInfo).toEqual({ videoCodec: 'h264' });
	});

	it('returns null quality/mediaInfo and zero size for a movie with no file rows', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({ id: 'm1', title: 'Ghost', fileId: null, fileSize: null })
		];

		const result = aggregateMovieRows(rows);

		expect(result).toHaveLength(1);
		expect(result[0].totalFileSize).toBe(0);
		expect(result[0].bestQuality).toBeNull();
		expect(result[0].bestMediaInfo).toBeNull();
	});

	it('produces one record per movie across multiple movies', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({
				id: 'm1',
				title: 'A',
				fileId: 'f1',
				fileSize: 6000,
				quality: { resolution: '2160p' },
				relativePath: 'a.mkv'
			}),
			movieRow({
				id: 'm2',
				title: 'B',
				fileId: 'f2',
				fileSize: 2000,
				quality: { resolution: '1080p' },
				relativePath: 'b.mkv'
			})
		];

		const result = aggregateMovieRows(rows);

		expect(result).toHaveLength(2);
		expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
	});

	it('preserves movie-level fields from the grouped movie', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({
				id: 'm1',
				title: 'Dune',
				year: 2021,
				tmdbId: 438631,
				libraryId: 'lib-1',
				fileId: 'f1',
				fileSize: 6000,
				quality: { resolution: '2160p' },
				relativePath: 'dune.mkv'
			}),
			movieRow({
				id: 'm1',
				title: 'Dune',
				year: 2021,
				tmdbId: 438631,
				libraryId: 'lib-1',
				fileId: 'f2',
				fileSize: 3000,
				quality: { resolution: '1080p' },
				relativePath: 'dune2.mkv'
			})
		];

		const result = aggregateMovieRows(rows);

		expect(result[0].title).toBe('Dune');
		expect(result[0].year).toBe(2021);
		expect(result[0].tmdbId).toBe(438631);
		expect(result[0].libraryId).toBe('lib-1');
	});

	it('defers to selectBestFile ranking (downloaded over strm regardless of resolution)', () => {
		const rows: MovieJoinedRow[] = [
			movieRow({
				id: 'm1',
				fileId: 'strm4k',
				fileSize: 100,
				quality: { resolution: '2160p' },
				relativePath: 'movie.strm'
			}),
			movieRow({
				id: 'm1',
				fileId: 'real1080',
				fileSize: 5000,
				quality: { resolution: '1080p' },
				relativePath: 'movie.mkv'
			})
		];

		const result = aggregateMovieRows(rows);

		expect((result[0].bestQuality as { resolution?: string })?.resolution).toBe('1080p');
	});
});
