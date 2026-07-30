import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export interface ResolutionCategory {
	id: string;
	label: string;
	minWidth: number;
	minHeight: number;
	searchTerms: string[] | null;
	isFallback: boolean | null;
	createdAt: string | null;
}

export async function getResolutionCategories(): Promise<ResolutionCategory[]> {
	return apiGet<ResolutionCategory[]>('/api/settings/library/resolution-categories');
}

export async function createResolutionCategory(input: {
	label: string;
	minWidth?: number;
	minHeight?: number;
	searchTerms?: string[];
}): Promise<ResolutionCategory> {
	return apiPost<ResolutionCategory>('/api/settings/library/resolution-categories', input);
}

export async function updateResolutionCategory(
	id: string,
	input: { label?: string; minWidth?: number; minHeight?: number; searchTerms?: string[] }
): Promise<ResolutionCategory> {
	return apiPut<ResolutionCategory>(`/api/settings/library/resolution-categories/${id}`, input);
}

export async function deleteResolutionCategory(id: string): Promise<void> {
	return apiDelete(`/api/settings/library/resolution-categories/${id}`);
}
