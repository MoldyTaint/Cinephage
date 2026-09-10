export type CapturedLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type CapturedLogDomain =
	| 'system'
	| 'http'
	| 'client'
	| 'auth'
	| 'main'
	| 'streams'
	| 'imports'
	| 'monitoring'
	| 'scans'
	| 'indexers'
	| 'subtitles'
	| 'livetv'
	| 'downloads';

export const CAPTURED_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_CAPTURED_LOG_LEVEL: CapturedLogLevel = 'info';

export const CAPTURED_LOG_DOMAINS = [
	'system',
	'http',
	'client',
	'auth',
	'main',
	'streams',
	'imports',
	'monitoring',
	'scans',
	'indexers',
	'subtitles',
	'livetv',
	'downloads'
] as const;

/** Friendly display labels for CAPTURED_LOG_DOMAINS - used wherever a domain is shown to a user. */
export const DOMAIN_LABELS: Record<CapturedLogDomain, string> = {
	system: 'System',
	http: 'HTTP',
	client: 'Client',
	auth: 'Auth',
	main: 'Main',
	streams: 'Streams',
	imports: 'Imports',
	monitoring: 'Monitoring',
	scans: 'Scans',
	indexers: 'Indexers',
	subtitles: 'Subtitles',
	livetv: 'Live TV',
	downloads: 'Downloads'
};

export interface CapturedLogEntry {
	id: string;
	timestamp: string;
	level: CapturedLogLevel;
	msg: string;
	logDomain?: CapturedLogDomain;
	component?: string;
	module?: string;
	service?: string;
	requestId?: string;
	correlationId?: string;
	supportId?: string;
	path?: string;
	method?: string;
	data?: Record<string, unknown>;
	err?: Record<string, unknown>;
}

export interface CapturedLogFilters {
	level?: CapturedLogLevel;
	levels?: CapturedLogLevel[];
	logDomain?: CapturedLogDomain;
	search?: string;
	supportId?: string;
	requestId?: string;
	correlationId?: string;
	from?: string;
	to?: string;
	limit?: number;
}
