import { resolvePath } from '$lib/utils/routing.js';

export function getMediaLink(activity: {
	mediaType: string;
	mediaId: number | string;
	seriesId?: number | string | null;
}): string {
	if (activity.mediaType === 'movie') return resolvePath(`/library/movie/${activity.mediaId}`);
	return resolvePath(`/library/tv/${activity.seriesId || activity.mediaId}`);
}

export function canLinkToMedia(activity: {
	status?: string;
	mediaType: string;
	mediaId?: number | string | null;
	seriesId?: number | string | null;
}): boolean {
	if (activity.status === 'removed') return false;
	if (activity.mediaType === 'movie') return Boolean(activity.mediaId);
	return Boolean(activity.seriesId || activity.mediaId);
}
