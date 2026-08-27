import type { ArchiverRecord } from '$lib/server/db/schema.js';

export type ArchiverType = 'rclone';

export interface ArchiverPublic {
	id: string;
	name: string;
	type: ArchiverType;
	endpoint: string;
	username: string | null;
	hasPassword: boolean;
	remote: string;
	basePath: string;
	mountedRootFolderId: string | null;
	mountedRootFolderName: string | null;
	mountedRootFolderPath: string | null;
	mountedRootFolderMediaType: string | null;
	timeoutSeconds: number;
	enabled: boolean;
	lastTestedAt: string | null;
	testResult: string | null;
	testError: string | null;
	createdAt: string | null;
	updatedAt: string | null;
}

export interface ArchiverTestResult {
	success: boolean;
	error?: string;
	version?: string;
}

export interface ArchiveFileResult {
	fileId: string;
	sourcePath: string;
	destination: string;
	size: number | null;
}

export interface ArchiverRootFolderDetails {
	name: string | null;
	path: string | null;
	mediaType: string | null;
}

export function toArchiverPublic(
	record: ArchiverRecord,
	rootFolder?: ArchiverRootFolderDetails
): ArchiverPublic {
	return {
		id: record.id,
		name: record.name,
		type: record.type as ArchiverType,
		endpoint: record.endpoint,
		username: record.username,
		hasPassword: Boolean(record.password),
		remote: record.remote,
		basePath: record.basePath,
		mountedRootFolderId: record.mountedRootFolderId,
		mountedRootFolderName: rootFolder?.name ?? null,
		mountedRootFolderPath: rootFolder?.path ?? null,
		mountedRootFolderMediaType: rootFolder?.mediaType ?? null,
		timeoutSeconds: record.timeoutSeconds,
		enabled: record.enabled,
		lastTestedAt: record.lastTestedAt,
		testResult: record.testResult,
		testError: record.testError,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt
	};
}
