/**
 * Migration Script: Remove 'enabled' key from monitoring_settings
 *
 * This script removes the master monitoring toggle from the database.
 * Run this after deploying the code changes.
 *
 * Usage: tsx scripts/remove-monitoring-enabled.ts
 */

import { db } from '../src/lib/server/db/index.js';
import { monitoringSettings } from '../src/lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
	console.log('Removing "enabled" key from monitoring_settings...');

	try {
		await db.delete(monitoringSettings).where(eq(monitoringSettings.key, 'enabled'));

		console.log('Successfully removed "enabled" key');
		console.log('   Monitoring will now always run on server startup');
	} catch (error) {
		console.error('Failed to remove "enabled" key:', error);
		process.exit(1);
	}
}

main();
