import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, truncate, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImportService } from './ImportService';

async function createTempDir() {
	return mkdtemp(join(tmpdir(), 'cinephage-import-'));
}

async function createSizedFile(filePath: string, sizeBytes: number) {
	await writeFile(filePath, '');
	await truncate(filePath, sizeBytes);
}

describe('ImportService NZB-Mount selection', () => {
	beforeEach(() => {
		ImportService.resetInstance();
	});

	it('prefers non-strm when present for NZB-Mount options', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			const mkvPath = join(dir, 'movie.mkv');

			await writeFile(strmPath, 'http://example.com/stream');
			await createSizedFile(mkvPath, 60 * 1024 * 1024);

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: true, preferNonStrm: true });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(mkvPath);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('allows small strm files when configured for NZB-Mount', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			await writeFile(strmPath, 'http://example.com/stream');

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: true, preferNonStrm: true });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(strmPath);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('rejects small strm files by default', async () => {
		const dir = await createTempDir();
		try {
			const strmPath = join(dir, 'movie.strm');
			await writeFile(strmPath, 'http://example.com/stream');

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(dir, { allowStrmSmall: false, preferNonStrm: false });

			expect(files).toHaveLength(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('includes symlinked video files when scanning import candidates', async () => {
		const sourceDir = await createTempDir();
		const downloadDir = await createTempDir();
		try {
			const targetPath = join(sourceDir, 'actual-video.mkv');
			const symlinkPath = join(downloadDir, 'linked-video.mkv');
			await createSizedFile(targetPath, 60 * 1024 * 1024);
			await symlink(targetPath, symlinkPath);

			const service = ImportService.getInstance();
			const files = await (
				service as unknown as {
					findImportableFiles: (
						downloadPath: string,
						options: { allowStrmSmall: boolean; preferNonStrm: boolean }
					) => Promise<Array<{ path: string; size: number }>>;
				}
			).findImportableFiles(downloadDir, { allowStrmSmall: false, preferNonStrm: false });

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(symlinkPath);
		} finally {
			await rm(sourceDir, { recursive: true, force: true });
			await rm(downloadDir, { recursive: true, force: true });
		}
	});
});
