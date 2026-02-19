import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, truncate, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DiskScanService } from './disk-scan';

async function createTempDir() {
	return mkdtemp(join(tmpdir(), 'cinephage-diskscan-'));
}

async function createSizedFile(filePath: string, sizeBytes: number) {
	await writeFile(filePath, '');
	await truncate(filePath, sizeBytes);
}

describe('DiskScanService symlink discovery', () => {
	it('discovers symlinked video files', async () => {
		const sourceDir = await createTempDir();
		const scanDir = await createTempDir();
		try {
			const targetPath = join(sourceDir, 'actual-video.mkv');
			const symlinkPath = join(scanDir, 'linked-video.mkv');

			// Above MIN_SCAN_SIZE_BYTES (10 MB)
			await createSizedFile(targetPath, 12 * 1024 * 1024);
			await symlink(targetPath, symlinkPath);

			const service = DiskScanService.getInstance();
			const discovered = await (
				service as unknown as {
					discoverFiles: (
						rootPath: string,
						currentPath?: string
					) => Promise<Array<{ path: string; relativePath: string }>>;
				}
			).discoverFiles(scanDir);

			expect(discovered.some((f) => f.path === symlinkPath)).toBe(true);
			expect(discovered.some((f) => f.relativePath === 'linked-video.mkv')).toBe(true);
		} finally {
			await rm(sourceDir, { recursive: true, force: true });
			await rm(scanDir, { recursive: true, force: true });
		}
	});
});
