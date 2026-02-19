/**
 * Live TV Accounts Stream SSE Endpoint
 *
 * GET /api/livetv/accounts/stream - Real-time account updates
 *
 * Events:
 * - connected: Initial connection established
 * - heartbeat: Keep-alive every 30s
 * - accounts:initial: Full accounts list
 * - account:created: New account added
 * - account:updated: Account updated (settings, sync status, test result)
 * - account:deleted: Account removed
 * - channels:syncStarted: Channel sync started
 * - channels:syncCompleted: Channel sync completed
 * - channels:syncFailed: Channel sync failed
 */

import { createSSEStream } from '$lib/server/sse';
import { liveTvEvents } from '$lib/server/livetv/LiveTvEvents';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return createSSEStream((send) => {
		const sendInitialState = async () => {
			try {
				const manager = getLiveTvAccountManager();
				const accounts = await manager.getAccounts();
				send('accounts:initial', { accounts });
			} catch {
				// Error fetching initial state
			}
		};

		sendInitialState();

		const onAccountCreated = async (_event: { accountId: string }) => {
			const manager = getLiveTvAccountManager();
			const accounts = await manager.getAccounts();
			send('account:created', { accounts });
		};

		const onAccountUpdated = async (_event: { accountId: string }) => {
			const manager = getLiveTvAccountManager();
			const accounts = await manager.getAccounts();
			send('account:updated', { accounts });
		};

		const onAccountDeleted = async (_event: { accountId: string }) => {
			const manager = getLiveTvAccountManager();
			const accounts = await manager.getAccounts();
			send('account:deleted', { accounts });
		};

		const onChannelsSyncStarted = (event: { accountId: string }) => {
			send('channels:syncStarted', event);
		};

		const onChannelsSyncCompleted = (event: { accountId: string; result: unknown }) => {
			send('channels:syncCompleted', event);
		};

		const onChannelsSyncFailed = (event: { accountId: string; error: string }) => {
			send('channels:syncFailed', event);
		};

		liveTvEvents.onAccountCreated(onAccountCreated);
		liveTvEvents.onAccountUpdated(onAccountUpdated);
		liveTvEvents.onAccountDeleted(onAccountDeleted);
		liveTvEvents.onChannelsSyncStarted(onChannelsSyncStarted);
		liveTvEvents.onChannelsSyncCompleted(onChannelsSyncCompleted);
		liveTvEvents.onChannelsSyncFailed(onChannelsSyncFailed);

		return () => {
			liveTvEvents.offAccountCreated(onAccountCreated);
			liveTvEvents.offAccountUpdated(onAccountUpdated);
			liveTvEvents.offAccountDeleted(onAccountDeleted);
			liveTvEvents.offChannelsSyncStarted(onChannelsSyncStarted);
			liveTvEvents.offChannelsSyncCompleted(onChannelsSyncCompleted);
			liveTvEvents.offChannelsSyncFailed(onChannelsSyncFailed);
		};
	});
};
