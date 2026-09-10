// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import SeriesEditModal, { type SeriesEditData } from './SeriesEditModal.svelte';

vi.mock('$lib/api/settings.js', () => ({
	getLibraryClassificationSettings: vi.fn().mockResolvedValue({})
}));

vi.mock('$lib/api/discover.js', () => ({
	getTmdb: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/api/library.js', () => ({
	getSeriesEpisodeGroups: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toasts: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

const qualityProfiles = [
	{ id: 'balanced', name: 'Balanced', description: '', isBuiltIn: true, isDefault: true },
	{ id: 'hq', name: 'HQ', description: '', isBuiltIn: false, isDefault: false }
];

describe('SeriesEditModal quality profile persistence (issue #493)', () => {
	let onSave: (data: SeriesEditData) => void;

	beforeEach(() => {
		onSave = vi.fn<(data: SeriesEditData) => void>();
	});

	afterEach(() => {
		cleanup();
	});

	function renderModal() {
		return render(SeriesEditModal, {
			props: {
				open: true,
				series: {
					tmdbId: 222,
					title: 'Example Series',
					year: 2018,
					monitored: true,
					scoringProfileId: null,
					rootFolderId: 'root-a',
					episodeFileCount: 0,
					seasonFolder: true,
					wantsSubtitles: true,
					seriesType: 'standard',
					path: 'Example Series (2018)',
					episodeGroupId: null,
					id: 'series-1',
					metadataLanguage: null,
					preferOriginalTitle: false
				},
				qualityProfiles,
				delayProfiles: [],
				rootFolders: [],
				saving: false,
				onClose: vi.fn(),
				onSave
			}
		});
	}

	it('persists the default scoring profile id when explicitly selected', async () => {
		renderModal();

		const select = screen.getByRole('combobox', { name: /quality profile/i }) as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'balanced' } });
		expect(select.value).toBe('balanced');

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scoringProfileId: 'balanced' }));
	});

	it('keeps null when the default profile was not explicitly changed', async () => {
		renderModal();

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scoringProfileId: null }));
	});
});
