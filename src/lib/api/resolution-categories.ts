import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from './client.js';

/**
 * A resolution_categories row as serialized by the resolution-categories
 * endpoints (JSON column already parsed, timestamp as ISO string).
 */
export interface ResolutionCategory {
	id: string;
	label: string;
	minWidth: number;
	minHeight: number;
	searchTerms: string[] | null;
	isFallback: boolean | null;
	createdAt: string | null;
}

/** The list endpoint returns the bare categories array, not the success envelope. */
export async function getResolutionCategories(): Promise<ResolutionCategory[]> {
	const response = await apiGet('/api/settings/library/resolution-categories');
	return response as unknown as ResolutionCategory[];
}

/** The create endpoint returns the bare created row (201), not the success envelope. */
export async function createResolutionCategory(input: {
	label: string;
	minWidth?: number;
	minHeight?: number;
	searchTerms?: string[];
}): Promise<ResolutionCategory> {
	const response = await apiPost('/api/settings/library/resolution-categories', input);
	return response as unknown as ResolutionCategory;
}

/** The update endpoint returns the bare updated row, not the success envelope. */
export async function updateResolutionCategory(
	id: string,
	input: { label?: string; minWidth?: number; minHeight?: number; searchTerms?: string[] }
): Promise<ResolutionCategory> {
	const response = await apiPut(`/api/settings/library/resolution-categories/${id}`, input);
	return response as unknown as ResolutionCategory;
}

/** The delete endpoint returns only the success envelope; there is no other payload. */
export async function deleteResolutionCategory(id: string): Promise<ApiResponse> {
	return apiDelete(`/api/settings/library/resolution-categories/${id}`);
}
