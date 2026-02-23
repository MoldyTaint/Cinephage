import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { getNewznabCapabilitiesProvider } from '$lib/server/indexers/newznab/NewznabCapabilitiesProvider';
import { indexerTestSchema } from '$lib/validation/schemas';

function redactSensitiveDetails(message: string): string {
	return message
		.replace(
			/([?&](?:apikey|api_key|password|passkey|token|secret|cookie)=)[^&\s;]+/gi,
			'$1[REDACTED]'
		)
		.replace(/https?:\/\/[^\s;]+/gi, '<indexer-url>');
}

type ApiStandard = 'torznab' | 'newznab';

function inferApiStandard(definitionId: string | undefined): ApiStandard | undefined {
	if (!definitionId) return undefined;
	const lower = definitionId.toLowerCase();
	if (lower.includes('torznab')) return 'torznab';
	if (lower.includes('newznab') || lower.includes('newsznab')) return 'newznab';
	return undefined;
}

function getApiStandardLabel(apiStandard: ApiStandard | undefined): string {
	if (apiStandard === 'torznab') return 'Torznab';
	if (apiStandard === 'newznab') return 'Newznab';
	return 'Torznab/Newznab';
}

function toFriendlyTestError(rawMessage: string, apiStandard?: ApiStandard): string {
	const message = rawMessage.trim().replace(/^Indexer test failed:\s*/i, '');
	const lower = message.toLowerCase();
	const apiLabel = getApiStandardLabel(apiStandard);

	// Provider-reported API errors (e.g. Newznab XML <error .../>)
	const apiErrorMatch = message.match(/Indexer(?: API)? error\s*([0-9]+)?\s*:?\s*(.+)/i);
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

	if (lower.includes('returned html instead of xml')) {
		return `Endpoint returned HTML instead of XML. Verify you are using the ${apiLabel} API URL.`;
	}

	if (lower.includes('missing <caps>')) {
		return `Endpoint is reachable but did not return a valid ${apiLabel} caps response.`;
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

function extractApiKey(
	settings: Record<string, string | number | boolean> | null | undefined
): string | undefined {
	if (!settings) return undefined;
	const candidate = settings.apikey ?? settings.apiKey ?? settings.api_key;
	if (typeof candidate !== 'string') return undefined;
	const trimmed = candidate.trim();
	return trimmed.length > 0 ? trimmed : undefined;
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
		const settings = (validated.settings ?? {}) as Record<string, string | number | boolean>;

		// Torznab validation uses the canonical caps endpoint.
		// API key is optional and only included when provided.
		if (validated.definitionId === 'torznab') {
			const provider = getNewznabCapabilitiesProvider();
			await provider.validateCapabilitiesEndpoint(validated.baseUrl, extractApiKey(settings));
		}

		await manager.testIndexer(
			{
				name: validated.name,
				definitionId: validated.definitionId,
				baseUrl: validated.baseUrl,
				alternateUrls: validated.alternateUrls,
				enabled: true,
				priority: 25,
				protocol,
				settings: settings as Record<string, string>,

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
		const apiStandard = inferApiStandard(validated.definitionId);
		return json(
			{ success: false, error: toFriendlyTestError(message, apiStandard) },
			{ status: 400 }
		);
	}
};
