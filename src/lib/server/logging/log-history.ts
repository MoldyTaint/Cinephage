import { mkdir, open, opendir, unlink } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stderr } from 'node:process';

import { eq } from 'drizzle-orm';

import type { CapturedLogEntry, CapturedLogFilters } from '$lib/logging/log-capture';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';

const serviceLogger = {
	warn(context: Record<string, unknown>, message: string): void {
		stderr.write(
			`${new Date().toISOString()} [LogHistoryService] WARN ${message} ${JSON.stringify(context)}\n`
		);
	},
	error(context: Record<string, unknown>, message: string): void {
		stderr.write(
			`${new Date().toISOString()} [LogHistoryService] ERROR ${message} ${JSON.stringify(context)}\n`
		);
	}
};

const DATA_DIR = process.env.DATA_DIR || 'data';
const LOGS_DIR = join(DATA_DIR, 'logs');

const LOG_RETENTION_SETTINGS_KEY = 'logs_retention_days';
export const DEFAULT_LOG_RETENTION_DAYS = 7;
export const MIN_LOG_RETENTION_DAYS = 1;
export const MAX_LOG_RETENTION_DAYS = 90;

export interface LogHistoryFilters extends CapturedLogFilters {
	from?: string;
	to?: string;
	supportId?: string;
	requestId?: string;
	correlationId?: string;
}

export interface LogHistoryQuery extends LogHistoryFilters {
	page?: number;
	pageSize?: number;
}

export interface LogHistoryResult {
	entries: CapturedLogEntry[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}

interface MatchingEntryPageResult {
	entries: CapturedLogEntry[];
	total: number;
	hasMore: boolean;
}

interface ParsedLogLineResult {
	entry: CapturedLogEntry | null;
	error: boolean;
}

type ReverseLineVisitor = (line: string) => boolean | void | Promise<boolean | void>;

function normalizeRetentionDays(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		return DEFAULT_LOG_RETENTION_DAYS;
	}

	return Math.max(MIN_LOG_RETENTION_DAYS, Math.min(MAX_LOG_RETENTION_DAYS, parsed));
}

function getFileDatePrefix(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function getLogFilePath(value: Date): string {
	return join(LOGS_DIR, `app-${getFileDatePrefix(value)}.jsonl`);
}

function parseLogFileDate(fileName: string): Date | null {
	const match = /^app-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(fileName);
	if (!match) return null;

	const parsed = new Date(`${match[1]}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimestamp(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function parseLogLine(line: string): ParsedLogLineResult {
	if (!line.trim()) {
		return { entry: null, error: false };
	}

	try {
		const parsed = JSON.parse(line) as CapturedLogEntry;
		if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
			return { entry: null, error: true };
		}
		return { entry: parsed, error: false };
	} catch {
		return { entry: null, error: true };
	}
}

async function readLinesReverse(filePath: string, visitor: ReverseLineVisitor): Promise<void> {
	const handle = await open(filePath, 'r');

	try {
		const { size } = await handle.stat();
		const chunkSize = 1024 * 1024;
		let position = size;
		let remainder = '';

		while (position > 0) {
			const readSize = Math.min(chunkSize, position);
			position -= readSize;
			const buffer = Buffer.alloc(readSize);
			await handle.read(buffer, 0, readSize, position);

			const chunk = buffer.toString('utf8') + remainder;
			const lines = chunk.split('\n');
			remainder = lines.shift() ?? '';

			for (let index = lines.length - 1; index >= 0; index -= 1) {
				const shouldContinue = await visitor(lines[index]);
				if (shouldContinue === false) {
					return;
				}
			}
		}

		if (remainder) {
			await visitor(remainder);
		}
	} finally {
		await handle.close();
	}
}

function matchesSearch(entry: CapturedLogEntry, query: string): boolean {
	const haystack = [
		entry.msg,
		entry.level,
		entry.logDomain,
		entry.component,
		entry.module,
		entry.service,
		entry.requestId,
		entry.supportId,
		entry.correlationId,
		entry.path,
		entry.method,
		entry.data ? JSON.stringify(entry.data) : '',
		entry.err ? JSON.stringify(entry.err) : ''
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();

	return haystack.includes(query);
}

function matchesHistoryFilters(entry: CapturedLogEntry, filters: LogHistoryFilters): boolean {
	if (filters.levels && filters.levels.length > 0 && !filters.levels.includes(entry.level)) {
		return false;
	}

	if (!filters.levels?.length && filters.level && entry.level !== filters.level) {
		return false;
	}

	if (filters.logDomain && entry.logDomain !== filters.logDomain) {
		return false;
	}

	if (filters.supportId && entry.supportId !== filters.supportId) {
		return false;
	}

	if (filters.requestId && entry.requestId !== filters.requestId) {
		return false;
	}

	if (filters.correlationId && entry.correlationId !== filters.correlationId) {
		return false;
	}

	const timestamp = parseTimestamp(entry.timestamp);
	const from = parseTimestamp(filters.from);
	const to = parseTimestamp(filters.to);

	if (from !== null && (timestamp === null || timestamp < from)) {
		return false;
	}

	if (to !== null && (timestamp === null || timestamp > to)) {
		return false;
	}

	const search = filters.search?.trim().toLowerCase();
	if (search && !matchesSearch(entry, search)) {
		return false;
	}

	return true;
}

async function listLogFiles(filters: LogHistoryFilters = {}): Promise<string[]> {
	if (!existsSync(LOGS_DIR)) {
		return [];
	}

	const from = parseTimestamp(filters.from);
	const to = parseTimestamp(filters.to);
	const files: Array<{ path: string; timestamp: number }> = [];
	const directory = await opendir(LOGS_DIR);

	for await (const entry of directory) {
		if (!entry.isFile()) continue;
		const fileDate = parseLogFileDate(entry.name);
		if (!fileDate) continue;

		const dayStart = fileDate.getTime();
		const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
		if (from !== null && dayEnd < from) continue;
		if (to !== null && dayStart > to) continue;

		files.push({ path: join(LOGS_DIR, entry.name), timestamp: dayStart });
	}

	files.sort((a, b) => b.timestamp - a.timestamp);
	return files.map((file) => file.path);
}

async function getMatchingEntryPage(
	filters: LogHistoryFilters = {},
	options: {
		offset?: number;
		limit?: number;
		stopWhenLimitReached?: boolean;
	} = {}
): Promise<MatchingEntryPageResult> {
	const files = await listLogFiles(filters);
	const entries: CapturedLogEntry[] = [];
	const offset = Math.max(0, options.offset ?? 0);
	const limit = Math.max(1, options.limit ?? 100);
	let parseErrors = 0;
	let total = 0;

	for (const filePath of files) {
		let reachedLimit = false;

		await readLinesReverse(filePath, async (line) => {
			const parsed = parseLogLine(line);
			if (parsed.error) {
				parseErrors += 1;
				return;
			}
			if (!parsed.entry) return;
			if (matchesHistoryFilters(parsed.entry, filters)) {
				if (total >= offset && entries.length < limit) {
					entries.push(parsed.entry);
				}
				total += 1;

				if (options.stopWhenLimitReached && entries.length >= limit) {
					reachedLimit = true;
					return false;
				}
			}
		});

		if (options.stopWhenLimitReached && reachedLimit) {
			break;
		}
	}

	if (parseErrors > 0) {
		serviceLogger.warn(
			{ parseErrors },
			'Skipped invalid persisted log lines while reading history'
		);
	}

	return {
		entries,
		total,
		hasMore: total > offset + entries.length
	};
}

class LogHistoryService {
	private currentFilePath: string | null = null;

	private stream: ReturnType<typeof createWriteStream> | null = null;

	private cleanupPromise: Promise<void> | null = null;

	private pendingWrites = Promise.resolve();

	async getRetentionDays(): Promise<number> {
		const row = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, LOG_RETENTION_SETTINGS_KEY))
			.get();

		return normalizeRetentionDays(row?.value);
	}

	async setRetentionDays(days: number): Promise<number> {
		const normalized = normalizeRetentionDays(days);
		await db
			.insert(settings)
			.values({
				key: LOG_RETENTION_SETTINGS_KEY,
				value: String(normalized)
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: String(normalized) }
			});

		await this.cleanupOldFiles(normalized);
		return normalized;
	}

	append(entry: CapturedLogEntry): void {
		this.pendingWrites = this.pendingWrites
			.then(async () => {
				await mkdir(LOGS_DIR, { recursive: true });
				const filePath = getLogFilePath(new Date(entry.timestamp));
				this.rotateIfNeeded(filePath);
				await new Promise<void>((resolve, reject) => {
					if (!this.stream) {
						reject(new Error('Log history stream is not available'));
						return;
					}

					this.stream.write(`${JSON.stringify(entry)}\n`, (error) => {
						if (error) {
							reject(error);
							return;
						}
						resolve();
					});
				});
				this.scheduleCleanup();
			})
			.catch((error) => {
				serviceLogger.error({ err: error }, 'Failed to persist structured log entry');
			});
	}

	async search(query: LogHistoryQuery = {}): Promise<LogHistoryResult> {
		const page = Math.max(1, query.page ?? 1);
		const pageSize = Math.max(1, Math.min(query.pageSize ?? 100, 500));
		const offset = (page - 1) * pageSize;
		const result = await getMatchingEntryPage(query, {
			offset,
			limit: pageSize,
			stopWhenLimitReached: offset === 0
		});

		return {
			entries: result.entries,
			total: result.total,
			page,
			pageSize,
			hasMore: result.hasMore
		};
	}

	async getSnapshot(filters: LogHistoryFilters = {}): Promise<CapturedLogEntry[]> {
		const limit = Math.min(Math.max(filters.limit ?? 200, 1), 5000);
		const result = await getMatchingEntryPage(filters, {
			limit,
			stopWhenLimitReached: true
		});
		return result.entries;
	}

	async cleanupOldFiles(retentionDays?: number): Promise<void> {
		const resolvedRetention = retentionDays ?? (await this.getRetentionDays());
		if (!existsSync(LOGS_DIR)) return;

		const cutoff = Date.now() - resolvedRetention * 24 * 60 * 60 * 1000;
		const directory = await opendir(LOGS_DIR);

		for await (const entry of directory) {
			if (!entry.isFile()) continue;
			const fileDate = parseLogFileDate(entry.name);
			if (!fileDate) continue;

			const dayEnd = fileDate.getTime() + 24 * 60 * 60 * 1000 - 1;
			if (dayEnd >= cutoff) continue;

			const filePath = join(LOGS_DIR, entry.name);
			if (filePath === this.currentFilePath) {
				this.closeStream();
			}

			await unlink(filePath);
		}
	}

	private rotateIfNeeded(filePath: string): void {
		if (this.currentFilePath === filePath && this.stream) {
			return;
		}

		this.closeStream();
		this.currentFilePath = filePath;
		this.stream = createWriteStream(filePath, {
			flags: 'a',
			encoding: 'utf8'
		});
		this.stream.on('error', (error) => {
			serviceLogger.error({ err: error, filePath }, 'Persisted log file stream failed');
		});
	}

	private closeStream(): void {
		if (this.stream) {
			this.stream.end();
			this.stream = null;
		}
		this.currentFilePath = null;
	}

	private scheduleCleanup(): void {
		if (this.cleanupPromise) {
			return;
		}

		this.cleanupPromise = this.cleanupOldFiles()
			.catch((error) => {
				serviceLogger.error({ err: error }, 'Failed to clean up persisted log files');
			})
			.finally(() => {
				this.cleanupPromise = null;
			});
	}
}

export const logHistoryService = new LogHistoryService();
