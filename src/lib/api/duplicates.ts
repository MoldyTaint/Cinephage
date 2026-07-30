import { apiGet, apiPost } from './client.js';

export interface DuplicateGroup {
	signature: string;
	signatureType: 'filename' | 'filehash';
	fileIds: string[];
	paths: string[];
	count: number;
	suppressed: boolean;
}

export async function getDuplicates(
	libraryId: string,
	mode: 'filename' | 'filehash' = 'filename'
): Promise<DuplicateGroup[]> {
	return apiGet<DuplicateGroup[]>('/api/library/duplicates', { libraryId, mode });
}

export async function suppressDuplicate(
	libraryId: string,
	signature: string,
	signatureType: 'filename' | 'filehash'
): Promise<void> {
	return apiPost('/api/library/duplicates', {
		libraryId,
		signature,
		signatureType,
		action: 'suppress'
	});
}

export async function unsuppressDuplicate(
	libraryId: string,
	signature: string,
	signatureType: 'filename' | 'filehash'
): Promise<void> {
	return apiPost('/api/library/duplicates', {
		libraryId,
		signature,
		signatureType,
		action: 'unsuppress'
	});
}
