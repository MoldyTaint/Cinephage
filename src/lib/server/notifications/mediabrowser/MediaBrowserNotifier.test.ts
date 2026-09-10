/**
 * MediaBrowserNotifier tests
 *
 * Focus: per-server event-toggle enforcement. Each queued update carries an
 * eventKind ('import' | 'upgrade' | 'rename' | 'delete'); sendToServers must
 * only deliver updates to servers whose matching toggle (onImport, onUpgrade,
 * onRename, onDelete) is enabled. Legacy kindless updates are delivered to
 * every enabled server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import type { MediaBrowserClient } from './MediaBrowserClient';

const mocks = vi.hoisted(() => ({
	notifyLibraryUpdate: vi.fn<(payload: unknown) => Promise<void>>().mockResolvedValue(undefined),
	servers: [] as Array<Record<string, unknown>>
}));

vi.mock('./MediaBrowserManager', () => ({
	getMediaBrowserManager: () => ({
		getEnabledServers: vi.fn(() => Promise.resolve(mocks.servers))
	})
}));

vi.mock('./MediaBrowserClient', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./MediaBrowserClient')>();
	// Class mock: `new MediaBrowserClient(...)` must work, so the mock
	// implementation has to be constructable (an arrow function is not).
	class MockClient {
		notifyLibraryUpdate = mocks.notifyLibraryUpdate;
		static mapPath = actual.MediaBrowserClient.mapPath;
	}
	return { MediaBrowserClient: MockClient as unknown as typeof MediaBrowserClient };
});

import { getMediaBrowserNotifier } from './MediaBrowserNotifier';

interface SentPayload {
	Updates: Array<{ Path: string; UpdateType: string }>;
}

function makeServer(overrides: Record<string, unknown> = {}) {
	return {
		id: 'server-1',
		name: 'Test Server',
		host: 'http://jellyfin.local',
		apiKey: 'key',
		serverType: 'jellyfin',
		enabled: true,
		pathMappings: null,
		onImport: true,
		onUpgrade: true,
		onRename: true,
		onDelete: true,
		...overrides
	};
}

async function readyNotifier() {
	const notifier = getMediaBrowserNotifier();
	notifier.start();
	await new Promise((resolve) => setImmediate(resolve));
	return notifier;
}

async function drain(notifier: ReturnType<typeof getMediaBrowserNotifier>) {
	await (notifier as unknown as { processBatch: () => Promise<void> }).processBatch();
}

function sentPayloads(): SentPayload[] {
	return mocks.notifyLibraryUpdate.mock.calls.map((call) => call[0] as SentPayload);
}

beforeEach(() => {
	mocks.notifyLibraryUpdate.mockClear();
	mocks.servers = [];
});

afterEach(async () => {
	await getMediaBrowserNotifier().stop();
});

describe('per-server event-toggle enforcement', () => {
	it('withholds rename-kind updates from servers with onRename=false', async () => {
		mocks.servers = [
			makeServer({ id: 'off', onRename: false }),
			makeServer({ id: 'on', onRename: true })
		];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Old Show (2010)', 'Deleted', 'rename');
		notifier.queueUpdate('/media/New Show (2010)', 'Modified', 'rename');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).toHaveBeenCalledTimes(1);
		const updates = sentPayloads()[0].Updates;
		expect(updates).toHaveLength(2);
		expect(updates.map((u) => u.UpdateType).sort()).toEqual(['Deleted', 'Modified']);
		expect(updates.map((u) => u.Path).sort()).toEqual([
			'/media/New Show (2010)',
			'/media/Old Show (2010)'
		]);
	});

	it('delivers delete-kind updates only to servers with onDelete enabled', async () => {
		mocks.servers = [
			makeServer({ id: 'off', onDelete: false }),
			makeServer({ id: 'on', onDelete: true })
		];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Gone (2020)', 'Deleted', 'delete');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).toHaveBeenCalledTimes(1);
		expect(sentPayloads()[0].Updates).toEqual([
			{ Path: '/media/Gone (2020)', UpdateType: 'Deleted' }
		]);
	});

	it('delivers legacy kindless updates to all enabled servers even with every toggle off', async () => {
		mocks.servers = [
			makeServer({
				id: 'off',
				onImport: false,
				onUpgrade: false,
				onRename: false,
				onDelete: false
			}),
			makeServer({ id: 'on' })
		];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Legacy (2001)', 'Modified');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).toHaveBeenCalledTimes(2);
		expect(sentPayloads().every((payload) => payload.Updates.length === 1)).toBe(true);
	});

	it('gates upgrade-kind updates on onUpgrade', async () => {
		mocks.servers = [makeServer({ id: 'off', onUpgrade: false })];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Upgraded (2002)', 'Modified', 'upgrade');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).not.toHaveBeenCalled();
	});

	it('gates import-kind updates on onImport', async () => {
		mocks.servers = [makeServer({ id: 'off', onImport: false })];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Fresh (2003)', 'Created', 'import');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).not.toHaveBeenCalled();
	});

	it('keeps the eventKind when a queued path is upgraded to Deleted', async () => {
		mocks.servers = [makeServer({ id: 'off', onRename: false, onImport: true })];
		const notifier = await readyNotifier();

		notifier.queueUpdate('/media/Same (2004)', 'Created', 'rename');
		notifier.queueUpdate('/media/Same (2004)', 'Deleted', 'rename');
		await drain(notifier);

		expect(mocks.notifyLibraryUpdate).not.toHaveBeenCalled();
	});
});
