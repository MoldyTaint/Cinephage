import type { StorageInsightRule } from '../types.js';
import { MissingFromMediaServerRule } from './MissingFromMediaServerRule.js';
import { UntrackedByCinephageRule } from './UntrackedByCinephageRule.js';
import { UnplayedRule } from './UnplayedRule.js';
import { DuplicateItemsRule } from './DuplicateItemsRule.js';
import { OrphanedFilesRule } from './OrphanedFilesRule.js';
import { HealthIssuesRule } from './HealthIssuesRule.js';
import { QualityBelowCutoffRule } from './QualityBelowCutoffRule.js';
import { BrokenPathsRule } from './BrokenPathsRule.js';
import { FilenameDuplicateRule } from './FilenameDuplicateRule.js';
import { RedundantQualityTiersRule } from './RedundantQualityTiersRule.js';

// Rules are added in Tasks 5-12. Each new rule is appended to this array.
export const ALL_RULES: StorageInsightRule[] = [
	new MissingFromMediaServerRule(),
	new UntrackedByCinephageRule(),
	new UnplayedRule(),
	new DuplicateItemsRule(),
	new OrphanedFilesRule(),
	new HealthIssuesRule(),
	new QualityBelowCutoffRule(),
	new BrokenPathsRule(),
	new FilenameDuplicateRule(),
	new RedundantQualityTiersRule()
];
