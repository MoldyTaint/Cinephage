import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	seedDefaultScoringProfiles: vi.fn(),
	getProfile: vi.fn(),
	getDefaultScoringProfile: vi.fn(),
	getEffectiveAnimeRootFolderEnforcement: vi.fn().mockResolvedValue(false)
}));

vi.mock('$lib/server/db/index.js', () => ({
	db: {},
	sqlite: {},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/quality/index.js', () => ({
	qualityFilter: {
		seedDefaultScoringProfiles: mocks.seedDefaultScoringProfiles,
		getProfile: mocks.getProfile,
		getDefaultScoringProfile: mocks.getDefaultScoringProfile
	}
}));

vi.mock('$lib/server/tmdb.js', () => ({ tmdb: {} }));
vi.mock('$lib/server/workers/index.js', () => ({
	SearchWorker: class {},
	workerManager: { spawnInBackground: vi.fn() }
}));
vi.mock('$lib/server/indexers/IndexerManager.js', () => ({ getIndexerManager: vi.fn() }));
vi.mock('./searchOnAdd.js', () => ({ searchOnAdd: {} }));
vi.mock('./anime-root-enforcement-settings.js', () => ({
	getEffectiveAnimeRootFolderEnforcement: mocks.getEffectiveAnimeRootFolderEnforcement
}));
vi.mock('$lib/logging/index.js', () => ({
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
	createChildLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn()
	}))
}));
vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
	createChildLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn()
	}))
}));

import { getEffectiveScoringProfileId } from './LibraryAddService.js';
import { ValidationError } from '$lib/errors';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.seedDefaultScoringProfiles.mockResolvedValue(undefined);
});

describe('getEffectiveScoringProfileId', () => {
	it('returns the provided profile id when it is valid', async () => {
		mocks.getProfile.mockResolvedValue({ id: 'custom-profile' });

		const result = await getEffectiveScoringProfileId('custom-profile');

		expect(result).toBe('custom-profile');
		expect(mocks.getProfile).toHaveBeenCalledWith('custom-profile');
		expect(mocks.getDefaultScoringProfile).not.toHaveBeenCalled();
	});

	it('throws a ValidationError when the provided profile id is invalid', async () => {
		mocks.getProfile.mockResolvedValue(null);

		await expect(getEffectiveScoringProfileId('missing-profile')).rejects.toThrow(ValidationError);
	});

	it('falls back to the owning library profile when no profile is provided', async () => {
		mocks.getProfile.mockResolvedValue({ id: 'library-profile' });
		mocks.getDefaultScoringProfile.mockResolvedValue({ id: 'global-default' });

		const result = await getEffectiveScoringProfileId(undefined, {
			qualityProfileId: 'library-profile'
		});

		expect(result).toBe('library-profile');
		expect(mocks.getProfile).toHaveBeenCalledWith('library-profile');
		expect(mocks.getDefaultScoringProfile).not.toHaveBeenCalled();
	});

	it('falls back to the global default when the library profile is no longer valid', async () => {
		mocks.getProfile.mockResolvedValue(null);
		mocks.getDefaultScoringProfile.mockResolvedValue({ id: 'global-default' });

		const result = await getEffectiveScoringProfileId(undefined, {
			qualityProfileId: 'deleted-profile'
		});

		expect(result).toBe('global-default');
	});

	it('falls back to the global default when the library has no profile', async () => {
		mocks.getDefaultScoringProfile.mockResolvedValue({ id: 'global-default' });

		const result = await getEffectiveScoringProfileId(undefined, { qualityProfileId: null });

		expect(result).toBe('global-default');
	});

	it('falls back to the global default when no library is provided', async () => {
		mocks.getDefaultScoringProfile.mockResolvedValue({ id: 'global-default' });

		const result = await getEffectiveScoringProfileId(undefined);

		expect(result).toBe('global-default');
	});
});
