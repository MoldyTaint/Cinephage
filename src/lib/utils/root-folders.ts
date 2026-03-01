interface RootFolderLike {
	id: string;
	name: string;
	mediaType: string;
	isDefault?: boolean;
}

export function sortRootFoldersForMediaType<T extends RootFolderLike>(
	rootFolders: T[],
	mediaType: 'movie' | 'tv'
): T[] {
	return rootFolders
		.filter((folder) => folder.mediaType === mediaType)
		.sort((a, b) => {
			if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
				return a.isDefault ? -1 : 1;
			}

			return a.name.localeCompare(b.name);
		});
}
