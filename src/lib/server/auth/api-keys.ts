import { and, eq, like, desc, notInArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { authApiKeys, userApiKeySecrets } from '$lib/server/db/schema.js';
import { decryptApiKey, encryptApiKey } from '$lib/server/crypto/apiKeyCrypto.js';
import { auth } from './auth.js';

type KeyCreationResult = {
	id: string;
	key: string;
};

export type ManagedApiKeyType = 'main' | 'streaming';

type ApiKeyPermissions = Record<string, string[]>;

const DEFAULT_STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 60;
const DEFAULT_STREAMING_API_KEY_RATE_LIMIT_MAX = 10000;

function getPositiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}

	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

const STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS = getPositiveIntegerEnv(
	'STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS',
	DEFAULT_STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS
);
const STREAMING_API_KEY_RATE_LIMIT_MAX = getPositiveIntegerEnv(
	'STREAMING_API_KEY_RATE_LIMIT_MAX',
	DEFAULT_STREAMING_API_KEY_RATE_LIMIT_MAX
);

type BetterAuthApiKey = {
	id: string;
	name?: string | null;
	key?: string | null;
	start?: string | null;
	prefix?: string | null;
	createdAt?: Date | string | null;
	metadata?: Record<string, unknown> | null;
	permissions?: ApiKeyPermissions | null;
	referenceId?: string;
};

export type RecoverableApiKey = {
	id: string;
	name?: string | null;
	key: string;
	createdAt?: Date | string | null;
	metadata?: Record<string, unknown> | null;
};

function isManagedApiKeyType(
	key: { metadata?: Record<string, unknown> | null } | null | undefined,
	type: ManagedApiKeyType
): boolean {
	return key?.metadata?.type === type;
}

function formatRecoverableApiKey(
	key: BetterAuthApiKey | null,
	recoveredKey: string | null
): RecoverableApiKey | null {
	if (!key) {
		return null;
	}

	return {
		id: key.id,
		name: key.name ?? null,
		key: recoveredKey || key.key || `${key.prefix || 'cinephage'}_${key.start || ''}...`,
		createdAt: key.createdAt,
		metadata: key.metadata ?? null
	};
}

export async function upsertRecoverableApiKeySecret(
	keyId: string,
	userId: string,
	plainKey: string
): Promise<void> {
	const encryptedKey = encryptApiKey(plainKey);
	const createdAt = new Date().toISOString();

	await db
		.insert(userApiKeySecrets)
		.values({
			id: keyId,
			userId,
			encryptedKey,
			createdAt
		})
		.onConflictDoUpdate({
			target: userApiKeySecrets.id,
			set: {
				userId,
				encryptedKey,
				createdAt
			}
		});
}

export async function getRecoverableApiKeyValue(keyId: string): Promise<string | null> {
	const keyRecord = await db.query.userApiKeySecrets.findFirst({
		where: eq(userApiKeySecrets.id, keyId)
	});

	return keyRecord ? decryptApiKey(keyRecord.encryptedKey) : null;
}

export async function createRecoverableApiKey(options: {
	userId: string;
	name: string;
	metadata: Record<string, unknown>;
	permissions: ApiKeyPermissions;
}): Promise<BetterAuthApiKey> {
	const apiKey = (await auth.api.createApiKey({
		body: {
			userId: options.userId,
			name: options.name,
			metadata: options.metadata,
			permissions: options.permissions,
			rateLimitEnabled: options.metadata.type === 'streaming',
			rateLimitTimeWindow:
				options.metadata.type === 'streaming' ? STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS : undefined,
			rateLimitMax:
				options.metadata.type === 'streaming' ? STREAMING_API_KEY_RATE_LIMIT_MAX : undefined
		}
	})) as BetterAuthApiKey;

	if (!apiKey.key) {
		throw new Error('Better Auth did not return a recoverable API key value');
	}

	await upsertRecoverableApiKeySecret(apiKey.id, options.userId, apiKey.key);

	return apiKey;
}

export async function ensureStreamingApiKeyRateLimit(userId?: string): Promise<number> {
	const conditions = [
		eq(authApiKeys.enabled, 1),
		like(authApiKeys.metadata, '%"type":"streaming"%')
	];

	if (userId) {
		conditions.push(eq(authApiKeys.referenceId, userId));
	}

	const result = await db
		.update(authApiKeys)
		.set({
			rateLimitEnabled: 1,
			rateLimitTimeWindow: STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS,
			rateLimitMax: STREAMING_API_KEY_RATE_LIMIT_MAX,
			requestCount: 0,
			remaining: null,
			lastRequest: null
		})
		.where(and(...conditions))
		.returning({ id: authApiKeys.id });

	return result.length;
}

export async function ensureDefaultApiKeysForUser(
	userId: string,
	headers: Headers
): Promise<{
	mainKey: KeyCreationResult | null;
	streamingKey: KeyCreationResult | null;
}> {
	const apiKeysResult = (await auth.api.listApiKeys({
		headers
	})) as { apiKeys: BetterAuthApiKey[] };
	const existingKeys = apiKeysResult.apiKeys;

	const hasMainKey = existingKeys.some((key) => isManagedApiKeyType(key, 'main'));
	const hasStreamingKey = existingKeys.some((key) => isManagedApiKeyType(key, 'streaming'));

	const result = {
		mainKey: null as KeyCreationResult | null,
		streamingKey: null as KeyCreationResult | null
	};

	if (!hasMainKey) {
		const mainKey = await createRecoverableApiKey({
			userId,
			name: 'Main API Key',
			metadata: {
				type: 'main',
				description: 'Full access to all API endpoints'
			},
			permissions: {
				default: ['*']
			}
		});

		result.mainKey = {
			id: mainKey.id,
			key: mainKey.key || ''
		};
	}

	if (!hasStreamingKey) {
		const streamingKey = await createRecoverableApiKey({
			userId,
			name: 'Media Streaming API Key',
			metadata: {
				type: 'streaming',
				description: 'Access to Live TV and Media Streaming endpoints for media server integration'
			},
			permissions: {
				livetv: ['*'],
				streaming: ['*']
			}
		});

		result.streamingKey = {
			id: streamingKey.id,
			key: streamingKey.key || ''
		};
	}

	return result;
}

export async function regenerateRecoverableApiKey(options: {
	keyId: string;
	userId: string;
	headers: Headers;
}): Promise<RecoverableApiKey | null> {
	const existingKey = (await auth.api.getApiKey({
		query: { id: options.keyId },
		headers: options.headers
	})) as BetterAuthApiKey | null;

	if (!existingKey || existingKey.referenceId !== options.userId) {
		return null;
	}

	await auth.api.deleteApiKey({
		body: { keyId: options.keyId },
		headers: options.headers
	});
	await db
		.delete(userApiKeySecrets)
		.where(
			and(
				eq(userApiKeySecrets.userId, options.userId),
				notInArray(userApiKeySecrets.id, db.select({ id: authApiKeys.id }).from(authApiKeys))
			)
		);

	const newKey = await createRecoverableApiKey({
		userId: options.userId,
		name: existingKey.name || 'API Key',
		metadata: existingKey.metadata || {},
		permissions: existingKey.permissions || { default: ['*'] }
	});

	return formatRecoverableApiKey(newKey, newKey.key || null);
}

export async function getManagedApiKeysForRequest(headers: Headers): Promise<{
	mainApiKey: RecoverableApiKey | null;
	streamingApiKey: RecoverableApiKey | null;
}> {
	const apiKeysResult = (await auth.api.listApiKeys({
		headers
	})) as { apiKeys: BetterAuthApiKey[] };
	const mainApiKey = apiKeysResult.apiKeys.find((key) => isManagedApiKeyType(key, 'main')) || null;
	const streamingApiKey =
		apiKeysResult.apiKeys.find((key) => isManagedApiKeyType(key, 'streaming')) || null;

	const [mainKeyValue, streamingKeyValue] = await Promise.all([
		mainApiKey ? getRecoverableApiKeyValue(mainApiKey.id) : Promise.resolve(null),
		streamingApiKey ? getRecoverableApiKeyValue(streamingApiKey.id) : Promise.resolve(null)
	]);

	return {
		mainApiKey: formatRecoverableApiKey(mainApiKey, mainKeyValue),
		streamingApiKey: formatRecoverableApiKey(streamingApiKey, streamingKeyValue)
	};
}

export async function getRecoverableApiKeyByType(
	type: ManagedApiKeyType,
	userId?: string
): Promise<string | null> {
	const conditions = [eq(authApiKeys.enabled, 1), like(authApiKeys.metadata, `%"type":"${type}"%`)];

	if (userId) {
		conditions.push(eq(authApiKeys.referenceId, userId));
	}

	const [result] = await db
		.select({
			encryptedKey: userApiKeySecrets.encryptedKey
		})
		.from(authApiKeys)
		.innerJoin(userApiKeySecrets, eq(userApiKeySecrets.id, authApiKeys.id))
		.where(and(...conditions))
		.orderBy(desc(authApiKeys.createdAt))
		.limit(1);

	return result ? decryptApiKey(result.encryptedKey) : null;
}
