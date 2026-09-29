/**
 * Pattern Config API client
 */

import { apiGet, apiPut } from './client.js';

/**
 * A library_pattern_config row as serialized by the pattern-config endpoints
 * (JSON columns already parsed, timestamps as ISO strings).
 */
export interface PatternConfigRow {
	id: string;
	libraryId: string | null;
	scope: string;
	ignoreDefaultsEnabled: boolean | null;
	ignoreUserPatterns: string[] | null;
	bonusPatterns: string[] | null;
	structureMode: string | null;
	structureConfig: Record<string, unknown> | null;
	createdAt: string | null;
	updatedAt: string | null;
}

export interface PatternConfigUpdate {
	libraryId?: string;
	ignoreDefaultsEnabled?: boolean;
	ignoreUserPatterns?: string[];
	bonusPatterns?: string[];
	structureMode?: 'none' | 'folder_depth' | 'regex' | null;
	structureConfig?: Record<string, unknown> | null;
}

/**
 * The GET endpoint returns the bare config row, not the success/error envelope.
 * When a libraryId is supplied and that library has no row yet, the endpoint
 * serializes null.
 */
export async function getPatternConfig(libraryId?: string): Promise<PatternConfigRow | null> {
	const params = libraryId ? { libraryId } : undefined;
	const response = await apiGet('/api/settings/library/pattern-config', params);
	return response as unknown as PatternConfigRow | null;
}

/** The PUT endpoint returns the bare saved config row, not the success envelope. */
export async function savePatternConfig(input: PatternConfigUpdate): Promise<PatternConfigRow> {
	const response = await apiPut('/api/settings/library/pattern-config', input);
	return response as unknown as PatternConfigRow;
}
