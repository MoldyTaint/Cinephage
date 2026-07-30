import { opendir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { stat } from 'node:fs/promises';
import { isVideoFile } from '$lib/server/library/media-info.js';
import { DOWNLOAD } from '$lib/config/constants';
import type { DiscoveredFile } from '$lib/server/library/disk-scan.js';
import {
	matchIgnore,
	classifyFile,
	recognizeStructure,
	type CompiledPatterns
} from '$lib/server/library/patterns/PatternRecognitionService.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'scans' as const });

// Hardcoded fallback patterns — used only when ScannerOptions.patterns is
// absent (backward-compatible path). When patterns are provided, the
// PatternRecognitionService handles all filtering.
const EXCLUDED_FOLDER_PATTERNS = [
	/^\./,
	/^@/,
	/^#recycle$/i,
	/^lost\+found$/i,
	/^\$recycle\.bin$/i,
	/^system volume information$/i,
	/^thumbs\.db$/i,
	/^\.ds_store$/i,
	/^samples?$/i,
	/^extras?$/i,
	/^featurettes?$/i,
	/^behind[\s._-]?the[\s._-]?scenes?$/i,
	/^deleted[\s._-]?scenes?$/i,
	/^specials?$/i,
	/^subs?$/i,
	/^subtitles?$/i
];

const SAMPLE_PATTERNS = [/\bsample\b/i];

export interface ScannerOptions {
	batchSize: number;
	customExcludedFolders: string[];
	blockedExtensions: string[];
	patterns?: CompiledPatterns;
}

const DEFAULT_OPTIONS: ScannerOptions = {
	batchSize: 500,
	customExcludedFolders: [],
	blockedExtensions: []
};

function shouldExcludeFolderLegacy(name: string, customPatterns: string[]): boolean {
	if (EXCLUDED_FOLDER_PATTERNS.some((pattern) => pattern.test(name))) return true;
	const lower = name.toLowerCase();
	return customPatterns.some((p) => p.toLowerCase() === lower);
}

function shouldExcludeFileLegacy(
	fileName: string,
	filePath: string,
	customPatterns: string[],
	blockedExtensions: string[]
): boolean {
	if (SAMPLE_PATTERNS.some((pattern) => pattern.test(fileName))) return true;

	if (blockedExtensions.length > 0) {
		const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
		if (blockedExtensions.includes(ext)) return true;
	}

	const pathParts = filePath.split('/');
	for (const part of pathParts) {
		if (shouldExcludeFolderLegacy(part, customPatterns)) return true;
	}

	return false;
}

export class StreamingDiskScanner {
	private options: ScannerOptions;

	constructor(options: Partial<ScannerOptions> = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	get hasPatterns(): boolean {
		return this.options.patterns !== undefined;
	}

	async *scan(rootPath: string): AsyncGenerator<DiscoveredFile[]> {
		let batch: DiscoveredFile[] = [];

		for await (const file of this.walkDirectory(rootPath, rootPath)) {
			batch.push(file);
			if (batch.length >= this.options.batchSize) {
				yield batch;
				batch = [];
			}
		}

		if (batch.length > 0) {
			yield batch;
		}
	}

	private shouldExcludeFolder(name: string): boolean {
		const { patterns, customExcludedFolders } = this.options;
		if (patterns) {
			// Folder-level ignore: test with trailing slash so directory
			// patterns match consistently.
			const relPath = name + '/';
			return matchIgnore(relPath, patterns);
		}
		return shouldExcludeFolderLegacy(name, customExcludedFolders);
	}

	private shouldExcludeFile(relPath: string, fileName: string): boolean {
		const { patterns, customExcludedFolders, blockedExtensions } = this.options;
		if (patterns) {
			return matchIgnore(relPath, patterns);
		}
		return shouldExcludeFileLegacy(fileName, relPath, customExcludedFolders, blockedExtensions);
	}

	private classify(relPath: string): 'main' | 'bonus' {
		const { patterns } = this.options;
		if (patterns) {
			return classifyFile(relPath, patterns) ?? 'main';
		}
		return 'main';
	}

	private async *walkDirectory(
		rootPath: string,
		currentPath: string
	): AsyncGenerator<DiscoveredFile> {
		let dirHandle: Awaited<ReturnType<typeof opendir>>;
		try {
			dirHandle = await opendir(currentPath);
		} catch (error) {
			const fsError = error as NodeJS.ErrnoException;
			if (fsError?.code === 'ENOENT' || fsError?.code === 'EACCES' || fsError?.code === 'EPERM') {
				logger.debug(
					{ currentPath, code: fsError.code },
					'[StreamingScanner] Skipping inaccessible directory'
				);
				return;
			}
			throw error;
		}

		for await (const entry of dirHandle) {
			const fullPath = join(currentPath, entry.name);

			if (entry.isDirectory()) {
				if (this.shouldExcludeFolder(entry.name)) continue;

				yield* this.walkDirectory(rootPath, fullPath);
			} else if (entry.isFile() || entry.isSymbolicLink()) {
				if (!isVideoFile(entry.name)) continue;

				const relativePath = relative(rootPath, fullPath);

				if (this.shouldExcludeFile(relativePath, entry.name)) continue;

				try {
					const stats = await stat(fullPath);

					if (entry.isSymbolicLink() && !stats.isFile()) continue;

					if (stats.size < DOWNLOAD.MIN_SCAN_SIZE_BYTES && !entry.name.endsWith('.strm')) {
						continue;
					}

					const contentCategory = this.classify(relativePath);
					const structureMatch = this.options.patterns
						? recognizeStructure(relativePath, this.options.patterns)
						: null;

					yield {
						path: fullPath,
						relativePath,
						size: stats.size,
						modifiedAt: stats.mtime,
						parentFolder: dirname(relativePath) || '.',
						contentCategory,
						structureMatch
					};
				} catch (statError) {
					logger.warn(
						{ fullPath, error: statError instanceof Error ? statError.message : String(statError) },
						'[StreamingScanner] Could not stat file'
					);
				}
			}
		}
	}
}
