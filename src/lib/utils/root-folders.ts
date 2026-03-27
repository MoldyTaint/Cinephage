interface RootFolderLike {
	id: string;
	name: string;
	mediaType: string;
	mediaSubType?: string | null;
	isDefault?: boolean;
}

export function sortRootFoldersForMediaType<T extends RootFolderLike>(
	rootFolders: T[],
	mediaType: 'movie' | 'tv',
	mediaSubType?: 'standard' | 'anime'
): T[] {
	return rootFolders
		.filter((folder) => {
			if (folder.mediaType !== mediaType) return false;
			if (!mediaSubType) return true;
			return (folder.mediaSubType ?? 'standard') === mediaSubType;
		})
		.sort((a, b) => {
			if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
				return a.isDefault ? -1 : 1;
			}

			return a.name.localeCompare(b.name);
		});
}
