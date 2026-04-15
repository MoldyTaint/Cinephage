import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { getServiceManager } from '$lib/server/services/service-manager.js';
import { resolveAppVersion } from '$lib/server/version.js';

export const GET: RequestHandler = async () => {
	let databaseReady = false;

	try {
		await db.select().from(settings).limit(1);
		databaseReady = true;
	} catch {
		databaseReady = false;
	}

	const serviceManager = getServiceManager();
	const servicesStarted = serviceManager.isStarted();
	const servicesReady = serviceManager.allReady();
	// Readiness should reflect whether the app can serve requests, even if
	// non-critical background services are still warming up.
	const ready = databaseReady && servicesStarted;

	return json(
		{
			status: ready ? 'ready' : 'starting',
			version: resolveAppVersion(),
			checks: {
				database: databaseReady ? 'ready' : 'starting',
				servicesStarted: servicesStarted ? 'ready' : 'starting',
				servicesReady: servicesReady ? 'ready' : 'starting'
			}
		},
		{ status: ready ? 200 : 503 }
	);
};
