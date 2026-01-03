/**
 * Tests for SABnzbd client fixes (Issue #51)
 *
 * These tests verify:
 * 1. Status mapping for post-processing states
 * 2. Queue vs History item handling
 */

import { describe, it, expect } from 'vitest';

// Replicate the status mapping logic from SABnzbdClient.ts
type SabnzbdDownloadStatus =
	| 'Grabbing'
	| 'Queued'
	| 'Paused'
	| 'Checking'
	| 'Downloading'
	| 'QuickCheck'
	| 'Verifying'
	| 'Repairing'
	| 'Fetching'
	| 'Extracting'
	| 'Moving'
	| 'Running'
	| 'Completed'
	| 'Failed'
	| 'Deleted'
	| 'Propagating';

type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'error';

function mapStatus(sabStatus: SabnzbdDownloadStatus, _percentage: number): DownloadStatus {
	switch (sabStatus) {
		case 'Grabbing':
		case 'Fetching':
		case 'Downloading':
			return 'downloading';

		case 'Paused':
			return 'paused';

		case 'Queued':
		case 'Propagating':
			return 'queued';

		case 'Completed':
			return 'completed';

		case 'Failed':
		case 'Deleted':
			return 'error';

		// Post-processing stages - these should ALWAYS return 'downloading'
		// even when percentage is 100%, because files aren't ready yet
		case 'Checking':
		case 'QuickCheck':
		case 'Verifying':
		case 'Repairing':
		case 'Extracting':
		case 'Moving':
		case 'Running':
			return 'downloading';

		default:
			return 'queued';
	}
}

describe('SABnzbd Status Mapping', () => {
	describe('Post-processing states at 100% progress', () => {
		const postProcessingStates: SabnzbdDownloadStatus[] = [
			'Checking',
			'QuickCheck',
			'Verifying',
			'Repairing',
			'Extracting',
			'Moving',
			'Running'
		];

		it.each(postProcessingStates)(
			'%s at 100%% should return "downloading", NOT "completed"',
			(status) => {
				const result = mapStatus(status, 100);
				expect(result).toBe('downloading');
				expect(result).not.toBe('completed');
			}
		);
	});

	describe('Only Completed status should return completed', () => {
		it('Completed status should return "completed"', () => {
			expect(mapStatus('Completed', 100)).toBe('completed');
		});

		it('Downloading at 100% should return "downloading"', () => {
			// This tests edge case where download is done but not yet in post-processing
			expect(mapStatus('Downloading', 100)).toBe('downloading');
		});
	});

	describe('Import trigger condition', () => {
		// Replicate the fixed import trigger condition
		function shouldTriggerImport(
			wasCompleted: boolean,
			status: DownloadStatus,
			progress: number
		): boolean {
			// OLD (buggy): return !wasCompleted && progress >= 1 && status !== 'error';
			// NEW (fixed): return !wasCompleted && status === 'completed';
			return !wasCompleted && status === 'completed';
		}

		it('should NOT trigger import when status is downloading but progress is 100%', () => {
			// This is the key fix - during SABnzbd post-processing:
			// - progress = 100 (1.0)
			// - status = 'downloading' (because Extracting/Moving mapped to downloading)
			const result = shouldTriggerImport(false, 'downloading', 1.0);
			expect(result).toBe(false);
		});

		it('should trigger import when status is completed', () => {
			const result = shouldTriggerImport(false, 'completed', 1.0);
			expect(result).toBe(true);
		});

		it('should NOT trigger import if already completed', () => {
			const result = shouldTriggerImport(true, 'completed', 1.0);
			expect(result).toBe(false);
		});
	});
});

describe('History Item Inclusion (Fix 0)', () => {
	// Simulates the history filtering logic
	// OLD: only included 'Completed' items, causing post-processing items to disappear
	// NEW: includes ALL history items regardless of status

	type HistoryItem = { nzo_id: string; status: string; storage: string };

	// The old buggy logic
	function oldFilterLogic(items: HistoryItem[]): HistoryItem[] {
		return items.filter((item) => item.status === 'Completed');
	}

	// The new fixed logic (no filter)
	function newFilterLogic(items: HistoryItem[]): HistoryItem[] {
		return items; // Include all items
	}

	it('should include post-processing items (new behavior)', () => {
		const historyItems: HistoryItem[] = [
			{ nzo_id: '1', status: 'Extracting', storage: '/mnt/sabnzbd/Movie1' },
			{ nzo_id: '2', status: 'Verifying', storage: '/mnt/sabnzbd/Movie2' },
			{ nzo_id: '3', status: 'Completed', storage: '/mnt/sabnzbd/Movie3' }
		];

		const oldResult = oldFilterLogic(historyItems);
		const newResult = newFilterLogic(historyItems);

		// Old behavior: only 1 item (Completed)
		expect(oldResult).toHaveLength(1);
		expect(oldResult[0].nzo_id).toBe('3');

		// New behavior: all 3 items
		expect(newResult).toHaveLength(3);
		expect(newResult.map((i) => i.nzo_id)).toEqual(['1', '2', '3']);
	});

	it('should track items during entire post-processing lifecycle', () => {
		// Simulates an item going through post-processing stages
		const lifecycle: HistoryItem[] = [
			{ nzo_id: 'a', status: 'Extracting', storage: '/mnt/sabnzbd/Movie' },
			{ nzo_id: 'a', status: 'Verifying', storage: '/mnt/sabnzbd/Movie' },
			{ nzo_id: 'a', status: 'Moving', storage: '/mnt/sabnzbd/Movie' },
			{ nzo_id: 'a', status: 'Completed', storage: '/mnt/sabnzbd/Movie' }
		];

		// With old logic, item "disappears" during Extracting, Verifying, Moving
		// This caused handleMissingDownload() to mark it as FAILED
		for (const stage of lifecycle) {
			const visible = newFilterLogic([stage]).length > 0;
			expect(visible).toBe(true);
		}
	});
});

describe('OutputPath Validation', () => {
	// Replicate the output path validation logic
	function isValidOutputPath(
		outputPath: string | null | undefined,
		downloadPathLocal: string | null | undefined
	): boolean {
		if (!outputPath) return false;
		if (!downloadPathLocal) return true; // Can't validate without base path

		const basePath = downloadPathLocal.replace(/\/+$/, '');
		const normalizedOutput = outputPath.replace(/\/+$/, '');

		// If outputPath equals the base path (or is shorter), it's invalid
		if (normalizedOutput === basePath || normalizedOutput.length <= basePath.length) {
			return false;
		}

		return true;
	}

	it('should reject outputPath that equals base directory', () => {
		expect(isValidOutputPath('/mnt/sabnzbd', '/mnt/sabnzbd')).toBe(false);
		expect(isValidOutputPath('/mnt/sabnzbd/', '/mnt/sabnzbd')).toBe(false);
		expect(isValidOutputPath('/mnt/sabnzbd', '/mnt/sabnzbd/')).toBe(false);
	});

	it('should accept outputPath that includes a subfolder', () => {
		expect(isValidOutputPath('/mnt/sabnzbd/Movie.Name.2024', '/mnt/sabnzbd')).toBe(true);
		expect(isValidOutputPath('/mnt/sabnzbd/complete/Movie.Name', '/mnt/sabnzbd')).toBe(true);
	});

	it('should reject empty or null outputPath', () => {
		expect(isValidOutputPath(null, '/mnt/sabnzbd')).toBe(false);
		expect(isValidOutputPath(undefined, '/mnt/sabnzbd')).toBe(false);
		expect(isValidOutputPath('', '/mnt/sabnzbd')).toBe(false);
	});

	it('should accept any path when downloadPathLocal is not configured', () => {
		// If no base path is configured, we can't validate
		expect(isValidOutputPath('/some/path', null)).toBe(true);
		expect(isValidOutputPath('/some/path', undefined)).toBe(true);
	});
});

describe('Storage Path Validation (Issue #51 Fix)', () => {
	// Replicate the isValidStoragePath logic from SABnzbdClient.ts
	function isValidStoragePath(storage: string | undefined, completeDir: string): boolean {
		if (!storage || storage.length === 0) return false;

		const normalizedStorage = storage.replace(/\/+$/, '');
		const normalizedBase = completeDir.replace(/\/+$/, '');

		// Must be longer than base (contains subfolder)
		if (normalizedStorage.length <= normalizedBase.length) return false;

		// Must start with base path
		if (!normalizedStorage.startsWith(normalizedBase)) return false;

		return true;
	}

	it('should reject empty storage', () => {
		expect(isValidStoragePath('', '/mnt/sabnzbd')).toBe(false);
		expect(isValidStoragePath(undefined, '/mnt/sabnzbd')).toBe(false);
	});

	it('should reject storage equal to base directory', () => {
		expect(isValidStoragePath('/mnt/sabnzbd', '/mnt/sabnzbd')).toBe(false);
		expect(isValidStoragePath('/mnt/sabnzbd/', '/mnt/sabnzbd')).toBe(false);
	});

	it('should accept storage with subfolder', () => {
		expect(isValidStoragePath('/mnt/sabnzbd/Movie.2024', '/mnt/sabnzbd')).toBe(true);
		expect(isValidStoragePath('/mnt/sabnzbd/complete/Movie.Name', '/mnt/sabnzbd')).toBe(true);
	});

	it('should reject storage shorter than base', () => {
		expect(isValidStoragePath('/mnt/sab', '/mnt/sabnzbd')).toBe(false);
	});

	it('should reject storage that does not start with base', () => {
		expect(isValidStoragePath('/other/path/Movie', '/mnt/sabnzbd')).toBe(false);
	});
});

describe('Path Construction Fallback (Issue #51 Fix)', () => {
	// Replicate the resolveOutputPath logic from SABnzbdClient.ts
	interface SabnzbdHistoryItem {
		nzo_id: string;
		name: string;
		storage: string;
		path?: string;
		category: string;
	}

	interface SabnzbdCategory {
		name: string;
		dir: string;
	}

	interface SabnzbdConfig {
		misc: { complete_dir: string };
		categories: SabnzbdCategory[];
	}

	function isValidStoragePath(storage: string | undefined, completeDir: string): boolean {
		if (!storage || storage.length === 0) return false;
		const normalizedStorage = storage.replace(/\/+$/, '');
		const normalizedBase = completeDir.replace(/\/+$/, '');
		if (normalizedStorage.length <= normalizedBase.length) return false;
		if (!normalizedStorage.startsWith(normalizedBase)) return false;
		return true;
	}

	function resolveOutputPath(item: SabnzbdHistoryItem, config: SabnzbdConfig): string {
		const baseDir = config.misc.complete_dir;

		// Use storage if valid
		if (isValidStoragePath(item.storage, baseDir)) {
			return item.storage;
		}

		// Try alternative path field
		if (item.path && isValidStoragePath(item.path, baseDir)) {
			return item.path;
		}

		// Fallback: construct from base + category dir + name
		const category = config.categories.find(
			(c) => c.name.toLowerCase() === item.category?.toLowerCase()
		);
		let outputDir = baseDir;

		if (category?.dir) {
			outputDir = category.dir.startsWith('/')
				? category.dir
				: `${baseDir.replace(/\/+$/, '')}/${category.dir}`;
		}

		return `${outputDir.replace(/\/+$/, '')}/${item.name}`;
	}

	it('should use storage when valid', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '/mnt/sabnzbd/Movie.2024',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: []
		};

		expect(resolveOutputPath(item, config)).toBe('/mnt/sabnzbd/Movie.2024');
	});

	it('should construct path from base + name when storage is empty', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: []
		};

		expect(resolveOutputPath(item, config)).toBe('/mnt/sabnzbd/Movie.2024');
	});

	it('should construct path from base + name when storage equals base dir', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '/mnt/sabnzbd',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: []
		};

		expect(resolveOutputPath(item, config)).toBe('/mnt/sabnzbd/Movie.2024');
	});

	it('should use category dir when set (relative path)', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: [{ name: 'movies', dir: 'films' }]
		};

		expect(resolveOutputPath(item, config)).toBe('/mnt/sabnzbd/films/Movie.2024');
	});

	it('should use category dir when set (absolute path)', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: [{ name: 'movies', dir: '/custom/films' }]
		};

		expect(resolveOutputPath(item, config)).toBe('/custom/films/Movie.2024');
	});

	it('should use alternative path field if storage is invalid but path is valid', () => {
		const item: SabnzbdHistoryItem = {
			nzo_id: '1',
			name: 'Movie.2024',
			storage: '',
			path: '/mnt/sabnzbd/alternate/Movie.2024',
			category: 'movies'
		};
		const config: SabnzbdConfig = {
			misc: { complete_dir: '/mnt/sabnzbd' },
			categories: []
		};

		expect(resolveOutputPath(item, config)).toBe('/mnt/sabnzbd/alternate/Movie.2024');
	});
});

describe('Completion Detection with Storage Validation (Issue #51 Fix)', () => {
	// Simulate the new mapHistoryItemAsync behavior
	function isValidStoragePath(storage: string | undefined, completeDir: string): boolean {
		if (!storage || storage.length === 0) return false;
		const normalizedStorage = storage.replace(/\/+$/, '');
		const normalizedBase = completeDir.replace(/\/+$/, '');
		if (normalizedStorage.length <= normalizedBase.length) return false;
		if (!normalizedStorage.startsWith(normalizedBase)) return false;
		return true;
	}

	function determineCompletionStatus(
		status: string,
		storage: string,
		baseDir: string
	): { isCompleted: boolean; mappedStatus: string } {
		const hasValidStorage = isValidStoragePath(storage, baseDir);
		const isCompleted = status === 'Completed' && hasValidStorage;

		return {
			isCompleted,
			mappedStatus: isCompleted ? 'completed' : 'downloading'
		};
	}

	it('should NOT mark as completed if status is Completed but storage is invalid', () => {
		const result = determineCompletionStatus('Completed', '/mnt/sabnzbd', '/mnt/sabnzbd');
		expect(result.isCompleted).toBe(false);
		expect(result.mappedStatus).toBe('downloading');
	});

	it('should NOT mark as completed if status is Completed but storage is empty', () => {
		const result = determineCompletionStatus('Completed', '', '/mnt/sabnzbd');
		expect(result.isCompleted).toBe(false);
		expect(result.mappedStatus).toBe('downloading');
	});

	it('should mark as completed only when status is Completed AND storage is valid', () => {
		const result = determineCompletionStatus(
			'Completed',
			'/mnt/sabnzbd/Movie.2024',
			'/mnt/sabnzbd'
		);
		expect(result.isCompleted).toBe(true);
		expect(result.mappedStatus).toBe('completed');
	});

	it('should NOT mark as completed for post-processing states even with valid storage', () => {
		const postProcessingStates = ['Extracting', 'Moving', 'Verifying', 'Running'];

		for (const status of postProcessingStates) {
			const result = determineCompletionStatus(
				status,
				'/mnt/sabnzbd/Movie.2024',
				'/mnt/sabnzbd'
			);
			expect(result.isCompleted).toBe(false);
			expect(result.mappedStatus).toBe('downloading');
		}
	});
});
