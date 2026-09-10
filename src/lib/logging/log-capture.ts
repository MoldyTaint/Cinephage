export type CapturedLogLevel = 'debug' | 'info' | 'warn' | 'error';

// Alphabetical by display label (see DOMAIN_LABELS below) - standard convention
// for a filter dropdown where the user scans for a domain they already have in
// mind, rather than one ranked by usage frequency or subjective "importance"
// (which would need constant upkeep and isn't obvious to someone filtering).
export type CapturedLogDomain =
	| 'auth'
	| 'client'
	| 'downloads'
	| 'http'
	| 'imports'
	| 'indexers'
	| 'livetv'
	| 'monitoring'
	| 'scans'
	| 'streams'
	| 'subtitles'
	| 'system';

export const CAPTURED_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_CAPTURED_LOG_LEVEL: CapturedLogLevel = 'info';

export const CAPTURED_LOG_DOMAINS = [
	'auth',
	'client',
	'downloads',
	'http',
	'imports',
	'indexers',
	'livetv',
	'monitoring',
	'scans',
	'streams',
	'subtitles',
	'system'
] as const;

/** Friendly display labels for CAPTURED_LOG_DOMAINS - used wherever a domain is shown to a user. */
export const DOMAIN_LABELS: Record<CapturedLogDomain, string> = {
	auth: 'Auth',
	client: 'Client',
	downloads: 'Downloads',
	http: 'HTTP',
	imports: 'Imports',
	indexers: 'Indexers',
	livetv: 'Live TV',
	monitoring: 'Monitoring',
	scans: 'Scans',
	streams: 'Streams',
	subtitles: 'Subtitles',
	system: 'System'
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
