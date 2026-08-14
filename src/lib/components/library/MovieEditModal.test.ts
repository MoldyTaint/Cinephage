// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import MovieEditModal, { type MovieEditData } from './MovieEditModal.svelte';
import type { LibraryMovie } from '$lib/types/library';

vi.mock('$lib/api/settings.js', () => ({
	getLibraryClassificationSettings: vi.fn().mockResolvedValue({})
}));

vi.mock('$lib/api/discover.js', () => ({
	getTmdb: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toasts: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

function makeMovie(overrides: Partial<LibraryMovie> = {}): LibraryMovie {
	return {
		id: 'movie-1',
		tmdbId: 111,
		imdbId: null,
		title: 'Example Movie',
		originalTitle: null,
		year: 2016,
		overview: null,
		posterPath: null,
		backdropPath: null,
		runtime: null,
		genres: null,
		added: '2026-01-01T00:00:00.000Z',
		hasFile: true,
		path: 'Example Movie (2016)',
		rootFolderId: 'root-a',
		rootFolderPath: '/mnt/movies',
		scoringProfileId: null,
		desiredQualities: [],
		monitored: true,
		minimumAvailability: 'released',
		wantsSubtitles: true,
		availabilityDelay: 0,
		tmdbCollectionId: null,
		collectionName: null,
		metadataLanguage: null,
		preferOriginalTitle: false,
		files: [],
		...overrides
	};
}

const qualityProfiles = [
	{ id: 'balanced', name: 'Balanced', description: '', isBuiltIn: true, isDefault: true },
	{ id: 'hq', name: 'HQ', description: '', isBuiltIn: false, isDefault: false }
];

describe('MovieEditModal quality profile persistence (issue #493)', () => {
	let onSave: (data: MovieEditData) => void;

	beforeEach(() => {
		onSave = vi.fn<(data: MovieEditData) => void>();
	});

	afterEach(() => {
		cleanup();
	});

	it('persists the default scoring profile id when explicitly selected', async () => {
		render(MovieEditModal, {
			props: {
				open: true,
				movie: makeMovie(),
				qualityProfiles,
				delayProfiles: [],
				rootFolders: [],
				saving: false,
				onClose: vi.fn(),
				onSave
			}
		});

		const select = screen.getByRole('combobox', { name: /quality profile/i }) as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'balanced' } });
		expect(select.value).toBe('balanced');

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scoringProfileId: 'balanced' }));
	});

	it('keeps null when the default profile was not explicitly changed', async () => {
		render(MovieEditModal, {
			props: {
				open: true,
				movie: makeMovie(),
				qualityProfiles,
				delayProfiles: [],
				rootFolders: [],
				saving: false,
				onClose: vi.fn(),
				onSave
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scoringProfileId: null }));
	});
});
