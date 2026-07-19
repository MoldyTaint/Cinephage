import type { InsightType } from '../types.js';
import type { InsightItemResolver } from './types.js';
import { brokenPathsResolver } from './broken-paths.js';
import { duplicateItemsResolver } from './duplicate-items.js';
import { qualityBelowCutoffResolver } from './quality-below-cutoff.js';
import { unplayedResolver } from './unplayed.js';
import { healthIssuesResolver } from './health-issues.js';
import { orphanedFilesResolver } from './orphaned-files.js';
import { untrackedByCinephageResolver } from './untracked-by-cinephage.js';
import { missingFromMediaServerResolver } from './missing-from-media-server.js';
import { filenameDuplicatesResolver } from './filename-duplicates.js';
import { redundantQualityTiersResolver } from './redundant-quality-tiers.js';

/**
 * Registry of per-type item resolvers.
 * Each insight type maps to one resolver function.
 */
const REGISTRY: Partial<Record<InsightType, InsightItemResolver>> = {};

export function registerInsightItemResolver(
	type: InsightType,
	resolver: InsightItemResolver
): void {
	REGISTRY[type] = resolver;
}

export function getInsightItemResolver(type: InsightType): InsightItemResolver {
	const resolver = REGISTRY[type];
	if (!resolver) {
		throw new Error(`No item resolver registered for insight type: ${type}`);
	}
	return resolver;
}

registerInsightItemResolver('broken-paths', brokenPathsResolver);
registerInsightItemResolver('duplicate-items', duplicateItemsResolver);
registerInsightItemResolver('quality-below-cutoff', qualityBelowCutoffResolver);
registerInsightItemResolver('unplayed', unplayedResolver);
registerInsightItemResolver('health-issues', healthIssuesResolver);
registerInsightItemResolver('orphaned-files', orphanedFilesResolver);
registerInsightItemResolver('untracked-by-cinephage', untrackedByCinephageResolver);
registerInsightItemResolver('missing-from-media-server', missingFromMediaServerResolver);
registerInsightItemResolver('filename-duplicates', filenameDuplicatesResolver);
registerInsightItemResolver('redundant-quality-tiers', redundantQualityTiersResolver);
