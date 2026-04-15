import { setImmediate } from 'node:timers';
import { createChildLogger } from '$lib/logging';
import { db } from '$lib/server/db/index.js';
import { movies, rootFolders, series, taskHistory } from '$lib/server/db/schema.js';
import { inArray, eq } from 'drizzle-orm';
import { getTaskHistoryService } from '$lib/server/tasks/TaskHistoryService.js';
import { activityStreamEvents } from '$lib/server/activity/ActivityStreamEvents.js';
import { libraryMediaEvents } from './LibraryMediaEvents.js';
import { moveDirectoryWithinRoots } from '$lib/server/filesystem/move-helpers.js';
import { getLibraryEntityService } from './LibraryEntityService.js';

const logger = createChildLogger({ module: 'MediaMoveService' });

type MoveMediaKind = 'movie' | 'series';

export interface EnqueueMediaMoveInput {
	mediaType: MoveMediaKind;
	mediaId: string;
	mediaTitle: string;
	relativePath: string;
	sourceRootFolderId: string;
	destinationRootFolderId: string;
}

interface ParsedMoveTaskId {
	mediaType: MoveMediaKind;
	mediaId: string;
}

function buildMoveTaskId(mediaType: MoveMediaKind, mediaId: string): string {
	return `media-move:${mediaType}:${mediaId}`;
}

export function parseMoveTaskId(taskId: string): ParsedMoveTaskId | null {
	if (!taskId.startsWith('media-move:')) return null;
	const parts = taskId.split(':');
	if (parts.length !== 3) return null;
	const mediaType = parts[1];
	const mediaId = parts[2];
	if ((mediaType !== 'movie' && mediaType !== 'series') || !mediaId) return null;
	return { mediaType, mediaId };
}

class MediaMoveService {
	private static instance: MediaMoveService | null = null;

	static getInstance(): MediaMoveService {
		if (!MediaMoveService.instance) {
			MediaMoveService.instance = new MediaMoveService();
		}
		return MediaMoveService.instance;
	}

	async enqueueMove(input: EnqueueMediaMoveInput): Promise<{ taskId: string; historyId: string }> {
		const taskHistoryService = getTaskHistoryService();
		const taskId = buildMoveTaskId(input.mediaType, input.mediaId);

		const historyId = await taskHistoryService.startTask(taskId);
		await db
			.update(taskHistory)
			.set({
				results: {
					kind: 'media_move',
					mediaType: input.mediaType,
					mediaId: input.mediaId,
					mediaTitle: input.mediaTitle,
					sourceRootFolderId: input.sourceRootFolderId,
					destinationRootFolderId: input.destinationRootFolderId
				}
			})
			.where(eq(taskHistory.id, historyId));
		this.emitActivityRefresh();

		setImmediate(() => {
			void this.executeMoveTask(taskId, historyId, input);
		});

		return { taskId, historyId };
	}

	private async executeMoveTask(
		taskId: string,
		historyId: string,
		input: EnqueueMediaMoveInput
	): Promise<void> {
		const taskHistoryService = getTaskHistoryService();
		try {
			const folders = await db
				.select({
					id: rootFolders.id,
					path: rootFolders.path
				})
				.from(rootFolders)
				.where(inArray(rootFolders.id, [input.sourceRootFolderId, input.destinationRootFolderId]));

			const sourceRoot = folders.find((folder) => folder.id === input.sourceRootFolderId);
			const destinationRoot = folders.find((folder) => folder.id === input.destinationRootFolderId);

			if (!sourceRoot?.path || !destinationRoot?.path) {
				throw new Error('Source or destination root folder path is missing');
			}

			const moved = await moveDirectoryWithinRoots(
				sourceRoot.path,
				input.relativePath,
				destinationRoot.path
			);
			const destinationLibrary = await getLibraryEntityService().resolveOwningLibraryForRootFolder(
				input.destinationRootFolderId,
				input.mediaType === 'movie' ? 'movie' : 'tv'
			);

			if (input.mediaType === 'movie') {
				await db
					.update(movies)
					.set({
						rootFolderId: input.destinationRootFolderId,
						libraryId: destinationLibrary.id
					})
					.where(eq(movies.id, input.mediaId));
				libraryMediaEvents.emitMovieUpdated(input.mediaId);
			} else {
				await db
					.update(series)
					.set({
						rootFolderId: input.destinationRootFolderId,
						libraryId: destinationLibrary.id
					})
					.where(eq(series.id, input.mediaId));
				libraryMediaEvents.emitSeriesUpdated(input.mediaId);
			}

			await taskHistoryService.completeTask(historyId, {
				kind: 'media_move',
				mediaType: input.mediaType,
				mediaId: input.mediaId,
				mediaTitle: input.mediaTitle,
				mode: moved.mode,
				sourcePath: moved.sourcePath,
				destPath: moved.destPath,
				sourceRootFolderId: input.sourceRootFolderId,
				destinationRootFolderId: input.destinationRootFolderId
			});

			logger.info(
				{
					taskId,
					historyId,
					mediaType: input.mediaType,
					mediaId: input.mediaId,
					mode: moved.mode
				},
				'[MediaMoveService] Root-folder move completed'
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown move error';
			await taskHistoryService.failTask(historyId, [message]);
			logger.error(
				{
					taskId,
					historyId,
					mediaType: input.mediaType,
					mediaId: input.mediaId,
					error: message
				},
				'[MediaMoveService] Root-folder move failed'
			);
		} finally {
			this.emitActivityRefresh();
		}
	}

	private emitActivityRefresh(): void {
		activityStreamEvents.emitRefresh({
			action: 'media_move',
			timestamp: new Date().toISOString()
		});
	}
}

export const mediaMoveService = MediaMoveService.getInstance();
