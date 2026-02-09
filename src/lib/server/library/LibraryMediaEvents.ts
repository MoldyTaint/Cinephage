import { EventEmitter } from 'events';

export interface MovieUpdatedEvent {
	movieId: string;
}

export interface SeriesUpdatedEvent {
	seriesId: string;
}

type LibraryMediaEventMap = {
	'movie:updated': (event: MovieUpdatedEvent) => void;
	'series:updated': (event: SeriesUpdatedEvent) => void;
};

class LibraryMediaEvents extends EventEmitter {
	emitMovieUpdated(movieId: string): void {
		this.emit('movie:updated', { movieId });
	}

	emitSeriesUpdated(seriesId: string): void {
		this.emit('series:updated', { seriesId });
	}

	onMovieUpdated(handler: LibraryMediaEventMap['movie:updated']): void {
		this.on('movie:updated', handler);
	}

	offMovieUpdated(handler: LibraryMediaEventMap['movie:updated']): void {
		this.off('movie:updated', handler);
	}

	onSeriesUpdated(handler: LibraryMediaEventMap['series:updated']): void {
		this.on('series:updated', handler);
	}

	offSeriesUpdated(handler: LibraryMediaEventMap['series:updated']): void {
		this.off('series:updated', handler);
	}
}

export const libraryMediaEvents = new LibraryMediaEvents();
