import type { InsightItemResolver } from './types.js';

export const filenameDuplicatesResolver: InsightItemResolver = async ({ insight, page, limit }) => {
	const rawDetails = insight.detailsJson ? JSON.parse(insight.detailsJson) : null;
	if (!rawDetails?.items || !Array.isArray(rawDetails.items)) {
		return { items: [], total: 0 };
	}

	const items: Array<{ signature: string; title: string; fileCount: number }> = rawDetails.items;
	const total = items.length;
	const sliceStart = (page - 1) * limit;
	const sliced = items.slice(sliceStart, sliceStart + limit);

	return {
		items: sliced.map((item, i) => ({
			id: `${insight.id}-${sliceStart + i}`,
			kind: 'file' as const,
			title: item.signature,
			subtitle: `${item.fileCount} files (${item.title})`,
			badges: [{ label: String(item.fileCount), tone: 'warn' as const }]
		})),
		total
	};
};
