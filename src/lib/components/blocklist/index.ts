export { default as BlocklistTable } from './BlocklistTable.svelte';
export { default as BlocklistBulkActions } from './BlocklistBulkActions.svelte';

export interface BlocklistEntry {
	id: string;
	title: string;
	infoHash: string | null;
	indexerId: string | null;
	movieId: string | null;
	seriesId: string | null;
	episodeIds: string[] | null;
	reason: string;
	message: string | null;
	sourceTitle: string | null;
	quality: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
	size: number | null;
	protocol: string | null;
	createdAt: string | null;
	expiresAt: string | null;
}
