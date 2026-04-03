import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { libraries, libraryRootFolders, rootFolders } from '$lib/server/db/schema.js';
import { NotFoundError, ValidationError } from '$lib/errors';

export type LibraryMediaType = 'movie' | 'tv';
export type LibraryMediaSubType = 'standard' | 'anime';

export interface LibraryRootFolder {
	id: string;
	name: string;
	path: string;
	mediaType: LibraryMediaType;
	mediaSubType: LibraryMediaSubType;
}

export interface LibraryEntity {
	id: string;
	name: string;
	slug: string;
	mediaType: LibraryMediaType;
	mediaSubType: LibraryMediaSubType;
	isSystem: boolean;
	systemKey: string | null;
	isDefault: boolean;
	rootFolders: LibraryRootFolder[];
	defaultRootFolderId: string | null;
	defaultRootFolderPath: string | null;
	defaultMonitored: boolean;
	defaultSearchOnAdd: boolean;
	defaultWantsSubtitles: boolean;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export interface CreateLibraryInput {
	name: string;
	mediaType: LibraryMediaType;
	mediaSubType?: LibraryMediaSubType;
	rootFolderIds?: string[];
	isDefault?: boolean;
	defaultMonitored?: boolean;
	defaultSearchOnAdd?: boolean;
	defaultWantsSubtitles?: boolean;
	sortOrder?: number;
}

export type UpdateLibraryInput = Partial<CreateLibraryInput>;

interface ListOptions {
	mediaType?: LibraryMediaType;
	includeSystem?: boolean;
}

const SYSTEM_LIBRARY_DEFS: Array<{
	id: string;
	name: string;
	slug: string;
	mediaType: LibraryMediaType;
	mediaSubType: LibraryMediaSubType;
	systemKey: string;
	isDefault: boolean;
	sortOrder: number;
}> = [
	{
		id: 'lib-movies-standard',
		name: 'Movies',
		slug: 'movies',
		mediaType: 'movie',
		mediaSubType: 'standard',
		systemKey: 'movies_standard',
		isDefault: true,
		sortOrder: 0
	},
	{
		id: 'lib-movies-anime',
		name: 'Anime Movies',
		slug: 'anime-movies',
		mediaType: 'movie',
		mediaSubType: 'anime',
		systemKey: 'movies_anime',
		isDefault: false,
		sortOrder: 10
	},
	{
		id: 'lib-tv-standard',
		name: 'TV Shows',
		slug: 'tv-shows',
		mediaType: 'tv',
		mediaSubType: 'standard',
		systemKey: 'tv_standard',
		isDefault: true,
		sortOrder: 0
	},
	{
		id: 'lib-tv-anime',
		name: 'Anime Series',
		slug: 'anime-series',
		mediaType: 'tv',
		mediaSubType: 'anime',
		systemKey: 'tv_anime',
		isDefault: false,
		sortOrder: 10
	}
];

function normalizeMediaSubType(input?: string | null): LibraryMediaSubType {
	if (input === 'anime') {
		return 'anime';
	}
	return 'standard';
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function uniqueStringArray(values: string[] | undefined): string[] {
	if (!values || values.length === 0) return [];
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}

async function ensureRootFoldersMatchLibrary(
	rootFolderIds: string[] | undefined,
	mediaType: LibraryMediaType,
	mediaSubType: LibraryMediaSubType
): Promise<void> {
	if (!rootFolderIds || rootFolderIds.length === 0) return;

	for (const rootFolderId of rootFolderIds) {
		const [folder] = await db
			.select({
				id: rootFolders.id,
				mediaType: rootFolders.mediaType,
				mediaSubType: rootFolders.mediaSubType
			})
			.from(rootFolders)
			.where(eq(rootFolders.id, rootFolderId))
			.limit(1);

		if (!folder) {
			throw new NotFoundError('Root folder', rootFolderId);
		}
		if (folder.mediaType !== mediaType) {
			const expectedLabel = mediaType === 'movie' ? 'Movies' : 'TV Shows';
			throw new ValidationError(`Root folder must be configured for ${expectedLabel}`);
		}
		if (normalizeMediaSubType(folder.mediaSubType) !== mediaSubType) {
			const expectedLabel = mediaSubType === 'anime' ? 'anime' : 'standard';
			throw new ValidationError(`Root folder must use the ${expectedLabel} media classification`);
		}
	}
}

async function getDefaultRootForSystemLibrary(
	mediaType: LibraryMediaType,
	mediaSubType: LibraryMediaSubType
): Promise<{ id: string; defaultMonitored: boolean } | null> {
	const [row] = await db
		.select({
			id: rootFolders.id,
			defaultMonitored: rootFolders.defaultMonitored
		})
		.from(rootFolders)
		.where(and(eq(rootFolders.mediaType, mediaType), eq(rootFolders.mediaSubType, mediaSubType)))
		.orderBy(desc(rootFolders.isDefault), asc(rootFolders.createdAt))
		.limit(1);

	if (!row) {
		return null;
	}
	return {
		id: row.id,
		defaultMonitored: row.defaultMonitored ?? true
	};
}

async function getRootFoldersForLibraries(libraryIds: string[]): Promise<
	Array<{
		libraryId: string;
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType: string;
		isDefault: boolean;
	}>
> {
	if (libraryIds.length === 0) return [];

	return await db
		.select({
			libraryId: libraryRootFolders.libraryId,
			id: rootFolders.id,
			name: rootFolders.name,
			path: rootFolders.path,
			mediaType: rootFolders.mediaType,
			mediaSubType: rootFolders.mediaSubType,
			isDefault: libraryRootFolders.isDefault
		})
		.from(libraryRootFolders)
		.innerJoin(rootFolders, eq(libraryRootFolders.rootFolderId, rootFolders.id))
		.where(
			sql`${libraryRootFolders.libraryId} IN (${sql.join(
				libraryIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		)
		.orderBy(
			asc(libraryRootFolders.libraryId),
			desc(libraryRootFolders.isDefault),
			asc(rootFolders.createdAt)
		);
}

export class LibraryEntityService {
	private _rootFolderBackfillComplete = false;

	private async backfillLibraryRootFolders(): Promise<void> {
		if (this._rootFolderBackfillComplete) {
			return;
		}

		const libraryRows = await db
			.select({
				id: libraries.id,
				mediaType: libraries.mediaType,
				mediaSubType: libraries.mediaSubType,
				defaultRootFolderId: libraries.defaultRootFolderId
			})
			.from(libraries);

		const existingAssignments = await db
			.select({
				libraryId: libraryRootFolders.libraryId,
				rootFolderId: libraryRootFolders.rootFolderId
			})
			.from(libraryRootFolders);

		const assigned = new Set(
			existingAssignments.map((row) => `${row.libraryId}:${row.rootFolderId}`)
		);
		const rootFoldersByMedia = new Map<string, { id: string; isDefault: boolean }>();

		const rootFolderRows = await db
			.select({
				id: rootFolders.id,
				mediaType: rootFolders.mediaType,
				mediaSubType: rootFolders.mediaSubType,
				isDefault: rootFolders.isDefault
			})
			.from(rootFolders);

		for (const folder of rootFolderRows) {
			const key = `${folder.mediaType}:${normalizeMediaSubType(folder.mediaSubType)}`;
			const current = rootFoldersByMedia.get(key);
			if (!current || (folder.isDefault ?? false)) {
				rootFoldersByMedia.set(key, { id: folder.id, isDefault: folder.isDefault ?? false });
			}
		}

		const rowsToInsert: Array<{
			libraryId: string;
			rootFolderId: string;
			isDefault: boolean;
			createdAt: string;
		}> = [];
		const now = new Date().toISOString();

		for (const library of libraryRows) {
			const fallbackRootFolder =
				library.defaultRootFolderId ??
				rootFoldersByMedia.get(
					`${library.mediaType}:${normalizeMediaSubType(library.mediaSubType)}`
				)?.id ??
				null;

			if (!fallbackRootFolder) {
				continue;
			}

			const key = `${library.id}:${fallbackRootFolder}`;
			if (assigned.has(key)) {
				continue;
			}

			rowsToInsert.push({
				libraryId: library.id,
				rootFolderId: fallbackRootFolder,
				isDefault: true,
				createdAt: now
			});
			assigned.add(key);
		}

		if (rowsToInsert.length > 0) {
			await db.insert(libraryRootFolders).values(rowsToInsert).onConflictDoNothing();
		}

		this._rootFolderBackfillComplete = true;
	}

	private async loadLibraryEntities(options: ListOptions = {}): Promise<LibraryEntity[]> {
		const includeSystem = options.includeSystem ?? true;
		if (includeSystem) {
			await this.syncSystemLibrariesFromRootFolders();
		}
		await this.backfillLibraryRootFolders();

		const rows = await db
			.select({
				id: libraries.id,
				name: libraries.name,
				slug: libraries.slug,
				mediaType: libraries.mediaType,
				mediaSubType: libraries.mediaSubType,
				isSystem: libraries.isSystem,
				systemKey: libraries.systemKey,
				isDefault: libraries.isDefault,
				defaultRootFolderId: libraries.defaultRootFolderId,
				defaultMonitored: libraries.defaultMonitored,
				defaultSearchOnAdd: libraries.defaultSearchOnAdd,
				defaultWantsSubtitles: libraries.defaultWantsSubtitles,
				sortOrder: libraries.sortOrder,
				createdAt: libraries.createdAt,
				updatedAt: libraries.updatedAt
			})
			.from(libraries)
			.where(
				and(
					options.mediaType ? eq(libraries.mediaType, options.mediaType) : undefined,
					includeSystem ? undefined : eq(libraries.isSystem, false)
				)
			)
			.orderBy(
				asc(libraries.mediaType),
				asc(libraries.sortOrder),
				desc(libraries.isSystem),
				asc(libraries.name)
			);

		const rootFolderRows = await getRootFoldersForLibraries(rows.map((row) => row.id));
		const rootFoldersByLibraryId = new Map<string, LibraryRootFolder[]>();
		const defaultPathByLibraryId = new Map<string, string | null>();

		for (const row of rootFolderRows) {
			const list = rootFoldersByLibraryId.get(row.libraryId) ?? [];
			const rootFolder: LibraryRootFolder = {
				id: row.id,
				name: row.name,
				path: row.path,
				mediaType: row.mediaType as LibraryMediaType,
				mediaSubType: normalizeMediaSubType(row.mediaSubType)
			};
			list.push(rootFolder);
			rootFoldersByLibraryId.set(row.libraryId, list);

			if (row.isDefault) {
				defaultPathByLibraryId.set(row.libraryId, row.path);
			}
		}

		return rows.map((row) => {
			const attachedRootFolders = rootFoldersByLibraryId.get(row.id) ?? [];
			const fallbackDefaultFolder = attachedRootFolders[0] ?? null;
			const defaultRootFolderId = row.defaultRootFolderId ?? fallbackDefaultFolder?.id ?? null;
			return {
				id: row.id,
				name: row.name,
				slug: row.slug,
				mediaType: row.mediaType as LibraryMediaType,
				mediaSubType: normalizeMediaSubType(row.mediaSubType),
				isSystem: row.isSystem ?? false,
				systemKey: row.systemKey ?? null,
				isDefault: row.isDefault ?? false,
				rootFolders: attachedRootFolders,
				defaultRootFolderId,
				defaultRootFolderPath:
					defaultPathByLibraryId.get(row.id) ??
					attachedRootFolders.find((folder) => folder.id === defaultRootFolderId)?.path ??
					null,
				defaultMonitored: row.defaultMonitored ?? true,
				defaultSearchOnAdd: row.defaultSearchOnAdd ?? true,
				defaultWantsSubtitles: row.defaultWantsSubtitles ?? true,
				sortOrder: row.sortOrder ?? 0,
				createdAt: row.createdAt ?? '',
				updatedAt: row.updatedAt ?? ''
			};
		});
	}

	async syncSystemLibrariesFromRootFolders(): Promise<void> {
		const now = new Date().toISOString();

		for (const def of SYSTEM_LIBRARY_DEFS) {
			const rootFolder = await getDefaultRootForSystemLibrary(def.mediaType, def.mediaSubType);
			await db
				.insert(libraries)
				.values({
					id: def.id,
					name: def.name,
					slug: def.slug,
					mediaType: def.mediaType,
					mediaSubType: def.mediaSubType,
					isSystem: true,
					systemKey: def.systemKey,
					isDefault: def.isDefault,
					defaultRootFolderId: rootFolder?.id ?? null,
					defaultMonitored: rootFolder?.defaultMonitored ?? true,
					defaultSearchOnAdd: true,
					defaultWantsSubtitles: true,
					sortOrder: def.sortOrder,
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: libraries.systemKey,
					set: {
						name: def.name,
						slug: def.slug,
						mediaType: def.mediaType,
						mediaSubType: def.mediaSubType,
						isDefault: def.isDefault,
						defaultRootFolderId: rootFolder?.id ?? null,
						defaultMonitored: rootFolder?.defaultMonitored ?? true,
						sortOrder: def.sortOrder,
						updatedAt: now
					}
				});

			if (rootFolder) {
				await db
					.insert(libraryRootFolders)
					.values({
						libraryId: def.id,
						rootFolderId: rootFolder.id,
						isDefault: true,
						createdAt: now
					})
					.onConflictDoNothing();
			}
		}
	}

	async listLibraries(options: ListOptions = {}): Promise<LibraryEntity[]> {
		return this.loadLibraryEntities(options);
	}

	async getLibrary(id: string): Promise<LibraryEntity | null> {
		const rows = await this.loadLibraryEntities();
		return rows.find((row) => row.id === id) ?? null;
	}

	async resolveDefaultRootFolderForLibrary(
		libraryId: string,
		mediaType: LibraryMediaType
	): Promise<{ library: LibraryEntity; rootFolderId: string; rootFolderPath: string }> {
		const library = await this.getLibrary(libraryId);
		if (!library) {
			throw new NotFoundError('Library', libraryId);
		}
		if (library.mediaType !== mediaType) {
			const expected = mediaType === 'movie' ? 'Movies' : 'TV Shows';
			throw new ValidationError(`Selected destination library must be a ${expected} library`);
		}

		const compatibleRootFolder =
			library.rootFolders.find((folder) => folder.id === library.defaultRootFolderId) ??
			library.rootFolders[0];
		if (!compatibleRootFolder) {
			throw new ValidationError(
				'Selected destination library has no default root folder configured'
			);
		}
		if (
			compatibleRootFolder.mediaType !== mediaType ||
			compatibleRootFolder.mediaSubType !== library.mediaSubType
		) {
			throw new ValidationError('Selected destination library points to an invalid root folder');
		}

		return {
			library,
			rootFolderId: compatibleRootFolder.id,
			rootFolderPath: compatibleRootFolder.path
		};
	}

	async createLibrary(input: CreateLibraryInput): Promise<LibraryEntity> {
		const mediaSubType = input.mediaSubType ?? 'standard';
		const rootFolderIds = uniqueStringArray(input.rootFolderIds);
		await ensureRootFoldersMatchLibrary(rootFolderIds, input.mediaType, mediaSubType);

		const now = new Date().toISOString();
		const id = randomUUID();
		const slug = await this.buildUniqueSlug(input.name, input.mediaType);
		const nextSortOrder =
			input.sortOrder ??
			((
				await db
					.select({ maxSort: sql<number>`COALESCE(MAX(${libraries.sortOrder}), 0)` })
					.from(libraries)
					.where(eq(libraries.mediaType, input.mediaType))
					.get()
			)?.maxSort ?? 0) + 10;

		if (input.isDefault) {
			await db
				.update(libraries)
				.set({ isDefault: false, updatedAt: now })
				.where(eq(libraries.mediaType, input.mediaType));
		}

		await db.insert(libraries).values({
			id,
			name: input.name.trim(),
			slug,
			mediaType: input.mediaType,
			mediaSubType,
			isSystem: false,
			systemKey: null,
			isDefault: input.isDefault ?? false,
			defaultRootFolderId: rootFolderIds[0] ?? null,
			defaultMonitored: input.defaultMonitored ?? true,
			defaultSearchOnAdd: input.defaultSearchOnAdd ?? true,
			defaultWantsSubtitles: input.defaultWantsSubtitles ?? true,
			sortOrder: nextSortOrder,
			createdAt: now,
			updatedAt: now
		});

		if (rootFolderIds.length > 0) {
			await db
				.insert(libraryRootFolders)
				.values(
					rootFolderIds.map((rootFolderId, index) => ({
						libraryId: id,
						rootFolderId,
						isDefault: index === 0,
						createdAt: now
					}))
				)
				.onConflictDoNothing();
		}

		const created = await this.getLibrary(id);
		if (!created) {
			throw new Error('Failed to create library');
		}
		return created;
	}

	async updateLibrary(id: string, updates: UpdateLibraryInput): Promise<LibraryEntity> {
		const existing = await this.getLibrary(id);
		if (!existing) {
			throw new NotFoundError('Library', id);
		}

		if (existing.isSystem && updates.name && updates.name.trim() !== existing.name) {
			throw new ValidationError('System libraries cannot be renamed');
		}
		if (existing.isSystem && updates.mediaType && updates.mediaType !== existing.mediaType) {
			throw new ValidationError('System libraries cannot change media type');
		}
		if (
			existing.isSystem &&
			updates.mediaSubType &&
			normalizeMediaSubType(updates.mediaSubType) !== existing.mediaSubType
		) {
			throw new ValidationError('System libraries cannot change media classification');
		}

		const mediaType = updates.mediaType ?? existing.mediaType;
		const mediaSubType = updates.mediaSubType
			? normalizeMediaSubType(updates.mediaSubType)
			: existing.mediaSubType;
		const rootFolderIds =
			updates.rootFolderIds !== undefined ? uniqueStringArray(updates.rootFolderIds) : undefined;
		if (rootFolderIds !== undefined) {
			await ensureRootFoldersMatchLibrary(rootFolderIds, mediaType, mediaSubType);
		}

		if (updates.isDefault) {
			await db
				.update(libraries)
				.set({ isDefault: false, updatedAt: new Date().toISOString() })
				.where(and(eq(libraries.mediaType, mediaType), ne(libraries.id, id)));
		}

		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};
		if (updates.name !== undefined) {
			updateData.name = updates.name.trim();
			if (!existing.isSystem) {
				updateData.slug = await this.buildUniqueSlug(updates.name, mediaType, id);
			}
		}
		if (updates.mediaType !== undefined && !existing.isSystem) {
			updateData.mediaType = updates.mediaType;
		}
		if (updates.mediaSubType !== undefined && !existing.isSystem) {
			updateData.mediaSubType = normalizeMediaSubType(updates.mediaSubType);
		}
		if (rootFolderIds !== undefined) {
			updateData.defaultRootFolderId = rootFolderIds[0] ?? null;
		}
		if (updates.isDefault !== undefined) {
			updateData.isDefault = updates.isDefault;
		}
		if (updates.defaultMonitored !== undefined) {
			updateData.defaultMonitored = updates.defaultMonitored;
		}
		if (updates.defaultSearchOnAdd !== undefined) {
			updateData.defaultSearchOnAdd = updates.defaultSearchOnAdd;
		}
		if (updates.defaultWantsSubtitles !== undefined) {
			updateData.defaultWantsSubtitles = updates.defaultWantsSubtitles;
		}
		if (updates.sortOrder !== undefined) {
			updateData.sortOrder = updates.sortOrder;
		}

		await db.update(libraries).set(updateData).where(eq(libraries.id, id));

		if (rootFolderIds !== undefined) {
			await db.delete(libraryRootFolders).where(eq(libraryRootFolders.libraryId, id));
			if (rootFolderIds.length > 0) {
				const now = new Date().toISOString();
				await db
					.insert(libraryRootFolders)
					.values(
						rootFolderIds.map((rootFolderId, index) => ({
							libraryId: id,
							rootFolderId,
							isDefault: index === 0,
							createdAt: now
						}))
					)
					.onConflictDoNothing();
			}
		}

		const updated = await this.getLibrary(id);
		if (!updated) {
			throw new Error('Failed to update library');
		}
		return updated;
	}

	async deleteLibrary(id: string): Promise<void> {
		const existing = await this.getLibrary(id);
		if (!existing) {
			throw new NotFoundError('Library', id);
		}
		if (existing.isSystem) {
			throw new ValidationError('System libraries cannot be deleted');
		}

		await db.delete(libraryRootFolders).where(eq(libraryRootFolders.libraryId, id));
		await db.delete(libraries).where(eq(libraries.id, id));
	}

	private async buildUniqueSlug(
		name: string,
		mediaType: LibraryMediaType,
		excludeId?: string
	): Promise<string> {
		const base = slugify(name) || `${mediaType}-library`;
		let candidate = base;
		let suffix = 2;

		while (true) {
			const [existing] = await db
				.select({ id: libraries.id })
				.from(libraries)
				.where(
					and(eq(libraries.slug, candidate), excludeId ? ne(libraries.id, excludeId) : undefined)
				)
				.limit(1);

			if (!existing) {
				return candidate;
			}

			candidate = `${base}-${suffix}`;
			suffix += 1;
		}
	}
}

let _libraryEntityService: LibraryEntityService | null = null;

export function getLibraryEntityService(): LibraryEntityService {
	if (!_libraryEntityService) {
		_libraryEntityService = new LibraryEntityService();
	}
	return _libraryEntityService;
}
