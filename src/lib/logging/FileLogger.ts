/**
 * File-based logging with rotation support.
 * Writes structured JSON logs to separate files per category.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	renameSync,
	statSync,
	readdirSync,
	unlinkSync,
	readFileSync
} from 'fs';
import { join } from 'path';

export type LogCategory =
	| 'main'
	| 'streams'
	| 'imports'
	| 'monitoring'
	| 'scans'
	| 'indexers'
	| 'subtitles'
	| 'livetv';

export interface FileLoggerConfig {
	logDir: string;
	maxSizeBytes: number;
	maxFiles: number;
	enabled: boolean;
}

const DEFAULT_CONFIG: FileLoggerConfig = {
	logDir: process.env.LOG_DIR || './logs',
	maxSizeBytes: (parseInt(process.env.LOG_MAX_SIZE_MB || '10', 10) || 10) * 1024 * 1024,
	maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10) || 5,
	enabled: process.env.LOG_TO_FILE !== 'false'
};

class FileLoggerImpl {
	private config: FileLoggerConfig;
	private initialized = false;

	constructor(config: Partial<FileLoggerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	private ensureDir(): void {
		if (this.initialized) return;
		if (!existsSync(this.config.logDir)) {
			mkdirSync(this.config.logDir, { recursive: true });
		}
		this.initialized = true;
	}

	private getLogPath(category: LogCategory): string {
		return join(this.config.logDir, `${category}.log`);
	}

	private rotate(category: LogCategory): void {
		const logPath = this.getLogPath(category);

		if (!existsSync(logPath)) return;

		try {
			const stats = statSync(logPath);
			if (stats.size < this.config.maxSizeBytes) return;

			// Rotate: main.log -> main.1.log, main.1.log -> main.2.log, etc.
			for (let i = this.config.maxFiles - 1; i >= 1; i--) {
				const oldPath = i === 1 ? logPath : join(this.config.logDir, `${category}.${i}.log`);
				const newPath = join(this.config.logDir, `${category}.${i + 1}.log`);

				if (existsSync(oldPath)) {
					if (i + 1 > this.config.maxFiles) {
						// Delete oldest file
						unlinkSync(oldPath);
					} else {
						renameSync(oldPath, newPath);
					}
				}
			}

			// Rename current log to .1
			renameSync(logPath, join(this.config.logDir, `${category}.1.log`));
		} catch {
			// Rotation failed - continue writing to current file
		}
	}

	/**
	 * Write a log entry to the specified category file.
	 */
	write(category: LogCategory, entry: string): void {
		if (!this.config.enabled) return;

		try {
			this.ensureDir();
			this.rotate(category);

			const logPath = this.getLogPath(category);
			appendFileSync(logPath, entry + '\n', 'utf-8');
		} catch {
			// File logging failed - don't throw, just continue
		}
	}

	/**
	 * Read recent log entries from a category file.
	 * Returns last N lines.
	 */
	read(category: LogCategory, lines = 100): string[] {
		const logPath = this.getLogPath(category);

		if (!existsSync(logPath)) return [];

		try {
			const content = readFileSync(logPath, 'utf-8');
			const allLines = content.split('\n').filter((l: string) => l.trim());
			return allLines.slice(-lines);
		} catch {
			return [];
		}
	}

	/**
	 * List all log files for a category (including rotated ones).
	 */
	listFiles(category: LogCategory): string[] {
		if (!existsSync(this.config.logDir)) return [];

		try {
			const files = readdirSync(this.config.logDir);
			return files
				.filter((f) => f.startsWith(`${category}.`) && f.endsWith('.log'))
				.map((f) => join(this.config.logDir, f))
				.sort();
		} catch {
			return [];
		}
	}

	/**
	 * Get current config.
	 */
	getConfig(): FileLoggerConfig {
		return { ...this.config };
	}

	/**
	 * Update config at runtime.
	 */
	updateConfig(config: Partial<FileLoggerConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

// Singleton instance
export const fileLogger = new FileLoggerImpl();

/**
 * Create a category-specific logger that writes to both console and file.
 */
export function createFileLogger(category: LogCategory) {
	return {
		write(entry: string): void {
			fileLogger.write(category, entry);
		},
		read(lines = 100): string[] {
			return fileLogger.read(category, lines);
		}
	};
}
