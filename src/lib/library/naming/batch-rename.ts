/** Split file ids into rename batches matching the server-side cap. */
export const RENAME_BATCH_SIZE = 500;

export function chunkFileIds(fileIds: string[], size = RENAME_BATCH_SIZE): string[][] {
	const chunks: string[][] = [];
	for (let i = 0; i < fileIds.length; i += size) {
		chunks.push(fileIds.slice(i, i + size));
	}
	return chunks;
}
