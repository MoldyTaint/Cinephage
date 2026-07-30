import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const { libraries, libraryRootFolders, rootFolders } = await import('$lib/server/db/schema.js');
const { eq } = await import('drizzle-orm');
const { LibraryEntityService } = await import('./LibraryEntityService.js');

afterAll(() => {
	destroyTestDb(testDb);
});

async function seedLibraryWithDefaultRoot(
	librarySlug: string,
	rootPath: string,
	sortOrder: number
): Promise<{ libraryId: string; rootFolderId: string }> {
	const now = new Date().toISOString();

	const insertedRoot = await testDb.db
		.insert(rootFolders)
		.values({
			name: `Root ${librarySlug}`,
			path: rootPath,
			mediaType: 'movie',
			mediaSubType: 'standard'
		})
		.returning({ id: rootFolders.id })
		.all();
	const rootFolderId = insertedRoot[0]!.id;

	const insertedLibrary = await testDb.db
		.insert(libraries)
		.values({
			name: `Library ${librarySlug}`,
			slug: librarySlug,
			mediaType: 'movie',
			mediaSubType: 'standard',
			isSystem: false,
			systemKey: null,
			isDefault: false,
			defaultRootFolderId: rootFolderId,
			defaultSearchOnAdd: true,
			defaultWantsSubtitles: false,
			sortOrder,
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: libraries.id })
		.all();
	const libraryId = insertedLibrary[0]!.id;

	return { libraryId, rootFolderId };
}

describe('LibraryEntityService.listLibraries (read-only regression)', () => {
	it('does not perform writes on the read path', async () => {
		// Seed a library with a defaultRootFolderId pointing at a root folder
		// that has no matching libraryRootFolders row. Before the fix, calling
		// listLibraries would trigger backfillLibraryRootFolders which inserts
		// a row. After the fix, no writes occur.
		const { libraryId, rootFolderId } = await seedLibraryWithDefaultRoot(
			'test-library-readonly',
			'/tmp/test-root-readonly',
			10
		);

		const assignmentsBefore = await testDb.db.select().from(libraryRootFolders).all();

		const service = new LibraryEntityService();
		const result = await service.listLibraries();

		expect(result.length).toBeGreaterThan(0);

		const assignmentsAfter = await testDb.db.select().from(libraryRootFolders).all();

		// No backfill insert should have occurred on the read path.
		expect(assignmentsAfter).toEqual(assignmentsBefore);

		// Cleanup.
		await testDb.db.delete(libraries).where(eq(libraries.id, libraryId));
		await testDb.db.delete(rootFolders).where(eq(rootFolders.id, rootFolderId));
	});

	it('reconcileAll seeds missing assignments', async () => {
		// Confirms reconcileAll still performs the backfill that listLibraries no longer does.
		const { libraryId, rootFolderId } = await seedLibraryWithDefaultRoot(
			'test-library-reconcile',
			'/tmp/test-root-reconcile',
			20
		);

		const service = new LibraryEntityService();
		await service.reconcileAll();

		const assignments = await testDb.db
			.select()
			.from(libraryRootFolders)
			.where(eq(libraryRootFolders.libraryId, libraryId))
			.all();

		expect(assignments.length).toBeGreaterThan(0);

		// Cleanup.
		await testDb.db.delete(libraryRootFolders).where(eq(libraryRootFolders.libraryId, libraryId));
		await testDb.db.delete(libraries).where(eq(libraries.id, libraryId));
		await testDb.db.delete(rootFolders).where(eq(rootFolders.id, rootFolderId));
	});
});
