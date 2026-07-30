/**
 * Pattern Config API client
 */

import { apiGet, apiPut } from './client.js';

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

export async function getPatternConfig(libraryId?: string): Promise<PatternConfigRow> {
	const params = libraryId ? { libraryId } : undefined;
	return apiGet<PatternConfigRow>('/api/settings/library/pattern-config', params);
}

export async function savePatternConfig(input: PatternConfigUpdate): Promise<PatternConfigRow> {
	return apiPut<PatternConfigRow>('/api/settings/library/pattern-config', input);
}
