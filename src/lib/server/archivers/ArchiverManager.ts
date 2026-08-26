import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { archivers, type ArchiverRecord } from '$lib/server/db/schema.js';
import type { ArchiverCreate, ArchiverTest, ArchiverUpdate } from '$lib/validation/schemas.js';
import { RcloneClient } from './RcloneClient.js';
import { toArchiverPublic, type ArchiverPublic, type ArchiverTestResult } from './types.js';

export class ArchiverManager {
	async list(enabledOnly = false): Promise<ArchiverPublic[]> {
		const rows = enabledOnly
			? await db
					.select()
					.from(archivers)
					.where(eq(archivers.enabled, true))
					.orderBy(asc(archivers.name))
			: await db.select().from(archivers).orderBy(asc(archivers.name));
		return rows.map(toArchiverPublic);
	}

	async getRecord(id: string): Promise<ArchiverRecord | null> {
		const [record] = await db.select().from(archivers).where(eq(archivers.id, id)).limit(1);
		return record ?? null;
	}

	async create(input: ArchiverCreate): Promise<ArchiverPublic> {
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
		return toArchiverPublic(record);
	}

	async update(id: string, input: ArchiverUpdate): Promise<ArchiverPublic | null> {
		const updates = Object.fromEntries(
			Object.entries(input).filter(([, value]) => value !== undefined)
		);
		if (typeof updates.remote === 'string') updates.remote = updates.remote.replace(/:$/, '');
		const [record] = await db
			.update(archivers)
			.set({ ...updates, updatedAt: new Date().toISOString() })
			.where(eq(archivers.id, id))
			.returning();
		return record ? toArchiverPublic(record) : null;
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
}

let manager: ArchiverManager | null = null;
export function getArchiverManager(): ArchiverManager {
	manager ??= new ArchiverManager();
	return manager;
}
