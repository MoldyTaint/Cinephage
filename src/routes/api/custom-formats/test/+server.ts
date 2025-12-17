import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseRelease, evaluateCondition } from '$lib/server/scoring';
import type { FormatCondition } from '$lib/server/scoring';
import { z } from 'zod';
import { logger } from '$lib/logging';

/**
 * Condition schema for testing
 */
const conditionSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.enum([
		'resolution',
		'source',
		'release_title',
		'release_group',
		'codec',
		'audio',
		'hdr',
		'streaming_service',
		'flag'
	]),
	required: z.boolean(),
	negate: z.boolean(),
	resolution: z.string().optional(),
	source: z.string().optional(),
	pattern: z.string().optional(),
	codec: z.string().optional(),
	audio: z.string().optional(),
	hdr: z.string().nullable().optional(),
	streamingService: z.string().optional(),
	flag: z.enum(['isRemux', 'isRepack', 'isProper', 'is3d']).optional()
});

const testSchema = z.object({
	releaseName: z.string().min(1),
	conditions: z.array(conditionSchema).min(1)
});

/**
 * POST /api/custom-formats/test
 * Test format conditions against a release name
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = testSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const { releaseName, conditions } = validation.data;

		// Parse the release name - returns ReleaseAttributes directly
		const attributes = parseRelease(releaseName);

		// Evaluate each condition
		const requiredConditions: { condition: FormatCondition; matched: boolean }[] = [];
		const optionalConditions: { condition: FormatCondition; matched: boolean }[] = [];

		for (const condition of conditions as FormatCondition[]) {
			const result = evaluateCondition(condition, attributes);
			const entry = { condition, matched: result.matches };

			if (condition.required) {
				requiredConditions.push(entry);
			} else {
				optionalConditions.push(entry);
			}
		}

		// Determine overall match
		const allRequiredMatch = requiredConditions.every((r) => r.matched);
		const anyOptionalMatch =
			optionalConditions.length === 0 || optionalConditions.some((r) => r.matched);
		const matched = allRequiredMatch && anyOptionalMatch;

		// Count results
		const matchedConditions = [...requiredConditions, ...optionalConditions].filter(
			(r) => r.matched
		).length;
		const failedConditions = requiredConditions.filter((r) => !r.matched).length;

		return json({
			matched,
			totalConditions: conditions.length,
			matchedConditions,
			failedConditions,
			// Parsed attributes for reference
			parsedAttributes: {
				resolution: attributes.resolution,
				source: attributes.source,
				codec: attributes.codec,
				hdr: attributes.hdr,
				audio: attributes.audio,
				releaseGroup: attributes.releaseGroup,
				streamingService: attributes.streamingService,
				isRemux: attributes.isRemux,
				isRepack: attributes.isRepack,
				isProper: attributes.isProper,
				is3d: attributes.is3d
			},
			// Detailed condition results
			conditionResults: [...requiredConditions, ...optionalConditions].map((r) => ({
				name: r.condition.name,
				type: r.condition.type,
				required: r.condition.required,
				negate: r.condition.negate,
				matched: r.matched
			}))
		});
	} catch (error) {
		logger.error('Error testing format:', error);
		return json({ error: 'Test failed' }, { status: 500 });
	}
};
