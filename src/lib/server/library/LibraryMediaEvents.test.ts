import { describe, it, expect, beforeEach } from 'vitest';
import { libraryMediaEvents, type LibraryDataChangedEvent } from './LibraryMediaEvents.js';

describe('LibraryMediaEvents', () => {
	describe('emitLibraryDataChanged', () => {
		it('emits the library:data-changed event with payload', () => {
			const received: LibraryDataChangedEvent[] = [];
			const handler = (event: LibraryDataChangedEvent) => received.push(event);

			libraryMediaEvents.onLibraryDataChanged(handler);
			try {
				libraryMediaEvents.emitLibraryDataChanged({
					source: 'movie',
					reason: 'test',
					entityId: 'm-1'
				});

				expect(received).toHaveLength(1);
				expect(received[0]).toEqual({
					source: 'movie',
					reason: 'test',
					entityId: 'm-1'
				});
			} finally {
				libraryMediaEvents.offLibraryDataChanged(handler);
			}
		});

		it('unsubscribes correctly via offLibraryDataChanged', () => {
			const received: LibraryDataChangedEvent[] = [];
			const handler = (event: LibraryDataChangedEvent) => received.push(event);

			libraryMediaEvents.onLibraryDataChanged(handler);
			libraryMediaEvents.offLibraryDataChanged(handler);

			libraryMediaEvents.emitLibraryDataChanged({
				source: 'movie',
				reason: 'test'
			});

			expect(received).toHaveLength(0);
		});
	});

	describe('emitMovieUpdated fan-out', () => {
		it('emits both movie:updated and library:data-changed', () => {
			const dataChanged: LibraryDataChangedEvent[] = [];
			const movieUpdated: string[] = [];
			const dataHandler = (e: LibraryDataChangedEvent) => dataChanged.push(e);
			const movieHandler = (e: { movieId: string }) => movieUpdated.push(e.movieId);

			libraryMediaEvents.onLibraryDataChanged(dataHandler);
			libraryMediaEvents.onMovieUpdated(movieHandler);
			try {
				libraryMediaEvents.emitMovieUpdated('movie-42');

				expect(movieUpdated).toEqual(['movie-42']);
				expect(dataChanged).toHaveLength(1);
				expect(dataChanged[0]).toEqual({
					source: 'movie',
					reason: 'movie-updated',
					entityId: 'movie-42'
				});
			} finally {
				libraryMediaEvents.offLibraryDataChanged(dataHandler);
				libraryMediaEvents.offMovieUpdated(movieHandler);
			}
		});
	});

	describe('emitSeriesUpdated fan-out', () => {
		it('emits both series:updated and library:data-changed', () => {
			const dataChanged: LibraryDataChangedEvent[] = [];
			const seriesUpdated: string[] = [];
			const dataHandler = (e: LibraryDataChangedEvent) => dataChanged.push(e);
			const seriesHandler = (e: { seriesId: string }) => seriesUpdated.push(e.seriesId);

			libraryMediaEvents.onLibraryDataChanged(dataHandler);
			libraryMediaEvents.onSeriesUpdated(seriesHandler);
			try {
				libraryMediaEvents.emitSeriesUpdated('series-99');

				expect(seriesUpdated).toEqual(['series-99']);
				expect(dataChanged).toHaveLength(1);
				expect(dataChanged[0]).toEqual({
					source: 'series',
					reason: 'series-updated',
					entityId: 'series-99'
				});
			} finally {
				libraryMediaEvents.offLibraryDataChanged(dataHandler);
				libraryMediaEvents.offSeriesUpdated(seriesHandler);
			}
		});
	});

	describe('isolation between instances', () => {
		// Ensures leftover listeners from one test don't fire in the next.
		beforeEach(() => {
			libraryMediaEvents.removeAllListeners('library:data-changed');
			libraryMediaEvents.removeAllListeners('movie:updated');
			libraryMediaEvents.removeAllListeners('series:updated');
		});

		it('does not deliver events to removed handlers', () => {
			const received: LibraryDataChangedEvent[] = [];
			const handler = (e: LibraryDataChangedEvent) => received.push(e);

			libraryMediaEvents.onLibraryDataChanged(handler);
			libraryMediaEvents.emitMovieUpdated('m-1');
			libraryMediaEvents.offLibraryDataChanged(handler);
			libraryMediaEvents.emitMovieUpdated('m-2');

			expect(received).toHaveLength(1);
			expect(received[0].entityId).toBe('m-1');
		});
	});
});
