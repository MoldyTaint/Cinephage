import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { indexerTestSchema } from '$lib/validation/schemas';

function redactSensitiveDetails(message: string): string {
	return message
		.replace(
			/([?&](?:apikey|api_key|password|passkey|token|secret|cookie)=)[^&\s;]+/gi,
			'$1[REDACTED]'
		)
		.replace(/https?:\/\/[^\s;]+/gi, '<indexer-url>');
}

function toFriendlyTestError(rawMessage: string): string {
	const message = rawMessage.trim().replace(/^Indexer test failed:\s*/i, '');
	const lower = message.toLowerCase();

	// Provider-reported API errors (e.g. Newznab XML <error .../>)
	const apiErrorMatch = message.match(/Indexer API error\s*([0-9]+)?\s*:?\s*(.+)/i);
	if (apiErrorMatch) {
		const code = apiErrorMatch[1];
		const description = apiErrorMatch[2]?.trim() ?? 'Unknown API error';

		if (/wrong api key|invalid api key|missing api key|apikey/i.test(description)) {
			return 'Authentication failed: invalid API key.';
		}

		return code
			? `Indexer API error (${code}): ${description}`
			: `Indexer API error: ${description}`;
	}

	if (
		lower.includes('wrong api key') ||
		lower.includes('invalid api key') ||
		lower.includes('missing api key')
	) {
		return 'Authentication failed: invalid API key.';
	}

	if (
		lower.includes('unable to reach indexer server') ||
		lower.includes('all test requests failed') ||
		lower.includes('all urls failed') ||
		lower.includes('fetch failed') ||
		lower.includes('econnrefused') ||
		lower.includes('enotfound') ||
		lower.includes('eai_again') ||
		lower.includes('etimedout') ||
		lower.includes('timeout') ||
		lower.includes('timed out') ||
		lower.includes('unreachable')
	) {
		return 'Unable to reach the indexer. Check URL, port, and SSL settings.';
	}

	if (
		lower.includes('authentication failed') ||
		lower.includes('login failed') ||
		lower.includes('unauthorized') ||
		lower.includes('forbidden')
	) {
		return 'Authentication failed. Check your credentials/cookies.';
	}

	if (lower.includes('cloudflare')) {
		return 'Connection blocked by Cloudflare protection.';
	}

	if (lower.includes('no test request could be generated')) {
		return 'Unable to build a valid test request for this indexer definition.';
	}

	const sanitized = redactSensitiveDetails(message);

	// Final fallback: collapse long chained test traces into a single concise reason.
	const sequenceMatch = sanitized.match(/(?:All test requests failed|All URLs failed):\s*(.+)/i);
	if (sequenceMatch?.[1]) {
		const firstReason = sequenceMatch[1]
			.split(';')
			.map((part) => part.trim())
			.map((part) => part.replace(/^<indexer-url>:\s*/i, ''))
			.find(Boolean);
		if (firstReason) {
			return firstReason.length > 180 ? `${firstReason.slice(0, 177)}...` : firstReason;
		}
	}

	return sanitized.length > 180 ? `${sanitized.slice(0, 177)}...` : sanitized;
}

export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = indexerTestSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				success: false,
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;

	const manager = await getIndexerManager();
	const indexerId = validated.indexerId;

	// Verify the definition exists
	const definition = manager.getDefinition(validated.definitionId);
	if (!definition) {
		return json(
			{
				success: false,
				error: `Unknown indexer definition: ${validated.definitionId}`
			},
			{ status: 400 }
		);
	}

	// If testing an existing saved indexer from overview, verify it exists
	// so health tracking updates apply only to real indexers.
	if (indexerId) {
		const existing = await manager.getIndexer(indexerId);
		if (!existing) {
			return json(
				{
					success: false,
					error: `Unknown indexer ID: ${indexerId}`
				},
				{ status: 400 }
			);
		}
	}

	try {
		// Get protocol from YAML definition
		const protocol = definition.protocol;

		await manager.testIndexer(
			{
				name: validated.name,
				definitionId: validated.definitionId,
				baseUrl: validated.baseUrl,
				alternateUrls: validated.alternateUrls,
				enabled: true,
				priority: 25,
				protocol,
				settings: (validated.settings ?? {}) as Record<string, string>,

				// Default values for test (not needed for connectivity test)
				enableAutomaticSearch: true,
				enableInteractiveSearch: true,
				minimumSeeders: 1,
				seedRatio: null,
				seedTime: null,
				packSeedTime: null
			},
			indexerId
		);

		return json({ success: true });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ success: false, error: toFriendlyTestError(message) }, { status: 400 });
	}
};
