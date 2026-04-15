#!/usr/bin/env npx tsx

import { backfillReleaseMetadata } from '../src/lib/server/library/release-metadata-backfill.js';

const apply = process.argv.includes('--apply');
const limitIndex = process.argv.indexOf('--sample-limit');
const sampleLimit =
	limitIndex >= 0 && process.argv[limitIndex + 1]
		? Number.parseInt(process.argv[limitIndex + 1], 10)
		: 50;

const result = await backfillReleaseMetadata({
	apply,
	sampleLimit: Number.isFinite(sampleLimit) ? sampleLimit : 50
});

console.log(JSON.stringify(result, null, 2));
