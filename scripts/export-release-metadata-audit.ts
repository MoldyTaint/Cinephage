#!/usr/bin/env npx tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backfillReleaseMetadata } from '../src/lib/server/library/release-metadata-backfill.js';

const outputDir = join(process.cwd(), 'data', 'reports');
mkdirSync(outputDir, { recursive: true });

const report = await backfillReleaseMetadata({ apply: false, sampleLimit: 100000 });
const allSuspicious = report.samples;
const highRisk = allSuspicious.filter((item) => item.riskLevel === 'high');
const lowRisk = allSuspicious.filter((item) => item.riskLevel === 'low');

const summary = {
	generatedAt: new Date().toISOString(),
	counts: {
		movieFilesScanned: report.movieFilesScanned,
		episodeFilesScanned: report.episodeFilesScanned,
		suspiciousSceneNames: report.suspiciousSceneNames,
		highRiskCount: report.highRiskCount,
		lowRiskCount: report.lowRiskCount,
		issueCounts: report.issueCounts
	}
};

writeFileSync(
	join(outputDir, 'release-metadata-audit-summary.json'),
	JSON.stringify(summary, null, 2)
);
writeFileSync(
	join(outputDir, 'release-metadata-audit-high-risk.json'),
	JSON.stringify(highRisk, null, 2)
);
writeFileSync(
	join(outputDir, 'release-metadata-audit-low-risk.json'),
	JSON.stringify(lowRisk, null, 2)
);
writeFileSync(
	join(outputDir, 'release-metadata-audit-all.json'),
	JSON.stringify(allSuspicious, null, 2)
);

console.log(
	JSON.stringify(
		{
			outputDir,
			summaryFile: join(outputDir, 'release-metadata-audit-summary.json'),
			highRiskFile: join(outputDir, 'release-metadata-audit-high-risk.json'),
			lowRiskFile: join(outputDir, 'release-metadata-audit-low-risk.json'),
			allFile: join(outputDir, 'release-metadata-audit-all.json'),
			highRiskCount: highRisk.length,
			lowRiskCount: lowRisk.length
		},
		null,
		2
	)
);
