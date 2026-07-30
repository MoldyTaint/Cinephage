import { apiGet, type ApiResponse } from './client.js';

export interface InsightItem {
	id: string;
	kind: 'movie' | 'series' | 'episode' | 'file' | 'folder';
	title: string;
	subtitle?: string;
	sizeBytes?: number;
	badges?: Array<{ label: string; tone: 'info' | 'warn' | 'critical' }>;
	href?: string;
}

export interface InsightItemsResponse {
	items: InsightItem[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export async function getInsightItems(
	insightId: string,
	params?: { page?: number; limit?: number }
): Promise<ApiResponse<{ data: InsightItemsResponse }>> {
	return apiGet(`/api/storage/insights/${insightId}/items`, {
		page: String(params?.page ?? 1),
		limit: String(params?.limit ?? 50)
	});
}
