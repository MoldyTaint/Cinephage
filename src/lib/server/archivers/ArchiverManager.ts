import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { archivers, rootFolders, type ArchiverRecord } from '$lib/server/db/schema.js';
import type { ArchiverCreate, ArchiverTest, ArchiverUpdate } from '$lib/validation/schemas.js';
import { RcloneClient } from './RcloneClient.js';
import { toArchiverPublic, type ArchiverPublic, type ArchiverTestResult } from './types.js';

export class ArchiverManager {
	async list(enabledOnly = false): Promise<ArchiverPublic[]> {
		const query = db
			.select({
				archiver: archivers,
				rootFolder: {
					name: rootFolders.name,
					path: rootFolders.path,
					mediaType: rootFolders.mediaType
				}
			})
			.from(archivers)
			.leftJoin(rootFolders, eq(archivers.mountedRootFolderId, rootFolders.id))
			.orderBy(asc(archivers.name));
		const rows = enabledOnly ? await query.where(eq(archivers.enabled, true)) : await query;
		return rows.map(({ archiver, rootFolder }) =>
			toArchiverPublic(archiver, rootFolder ?? undefined)
		);
	}

	async getRecord(id: string): Promise<ArchiverRecord | null> {
		const [record] = await db.select().from(archivers).where(eq(archivers.id, id)).limit(1);
		return record ?? null;
	}

	async create(input: ArchiverCreate): Promise<ArchiverPublic> {
		await this.assertMountedRootFolderExists(input.mountedRootFolderId);
		const now = new Date().toISOString();
		const [record] = await db
			.insert(archivers)
			.values({
				id: randomUUID(),
				...input,
				remote: input.remote.replace(/:$/, ''),
				createdAt: now,
				updatedAt: now
			})
			.returning();
		return (await this.getPublic(record.id))!;
	}

	async update(id: string, input: ArchiverUpdate): Promise<ArchiverPublic | null> {
		await this.assertMountedRootFolderExists(input.mountedRootFolderId);
		const updates = Object.fromEntries(
			Object.entries(input).filter(([, value]) => value !== undefined)
		);
		if (typeof updates.remote === 'string') updates.remote = updates.remote.replace(/:$/, '');
		const [record] = await db
			.update(archivers)
			.set({ ...updates, updatedAt: new Date().toISOString() })
			.where(eq(archivers.id, id))
			.returning();
		return record ? this.getPublic(record.id) : null;
	}

	async delete(id: string): Promise<boolean> {
		const deleted = await db
			.delete(archivers)
			.where(eq(archivers.id, id))
			.returning({ id: archivers.id });
		return deleted.length > 0;
	}

	async testConfig(config: ArchiverTest): Promise<ArchiverTestResult> {
		return new RcloneClient({
			...config,
			basePath: config.basePath ?? '',
			timeoutSeconds: config.timeoutSeconds ?? 3600
		}).test();
	}

	async testRecord(record: ArchiverRecord): Promise<ArchiverTestResult> {
		const result = await new RcloneClient(record).test();
		await db
			.update(archivers)
			.set({
				lastTestedAt: new Date().toISOString(),
				testResult: result.success ? 'success' : 'failed',
				testError: result.error ?? null
			})
			.where(eq(archivers.id, record.id));
		return result;
	}

	private async getPublic(id: string): Promise<ArchiverPublic | null> {
		const [row] = await db
			.select({
				archiver: archivers,
				rootFolder: {
					name: rootFolders.name,
					path: rootFolders.path,
					mediaType: rootFolders.mediaType
				}
			})
			.from(archivers)
			.leftJoin(rootFolders, eq(archivers.mountedRootFolderId, rootFolders.id))
			.where(eq(archivers.id, id))
			.limit(1);
		return row ? toArchiverPublic(row.archiver, row.rootFolder ?? undefined) : null;
	}

	private async assertMountedRootFolderExists(id: string | null | undefined): Promise<void> {
		if (!id) return;
		const [folder] = await db
			.select({ id: rootFolders.id })
			.from(rootFolders)
			.where(eq(rootFolders.id, id))
			.limit(1);
		if (!folder) throw new Error('Mounted root folder not found');
	}
}

let manager: ArchiverManager | null = null;
export function getArchiverManager(): ArchiverManager {
	manager ??= new ArchiverManager();
	return manager;
}
