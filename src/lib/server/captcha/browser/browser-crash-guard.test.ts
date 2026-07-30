/**
 * Browser crash guard tests.
 *
 * Focuses on the pure classifier (which errors are browser-origin) and the
 * safety property that the guard does NOT register global process handlers
 * while running under Vitest.
 */

import { describe, it, expect } from 'vitest';
import {
	isBrowserOriginError,
	installBrowserCrashGuard,
	__resetBrowserCrashGuardForTests
} from './browser-crash-guard';

function errorWithStack(message: string, stack: string): Error {
	const err = new Error(message);
	err.stack = stack;
	return err;
}

describe('isBrowserOriginError', () => {
	it('matches the real playwright-core Firefox pageerror crash', () => {
		const err = errorWithStack(
			"Cannot read properties of undefined (reading 'url')",
			[
				"TypeError: Cannot read properties of undefined (reading 'url')",
				'    at FFBrowserContext.<anonymous> (/app/node_modules/playwright-core/lib/coreBundle.js:49624:39)',
				'    at FFPage._onUncaughtError (/app/node_modules/playwright-core/lib/coreBundle.js:43470:20)',
				'    at FFSession.emit (node:events:519:28)'
			].join('\n')
		);
		expect(isBrowserOriginError(err)).toBe(true);
	});

	it('matches transient browser messages regardless of stack', () => {
		expect(isBrowserOriginError(new Error('Target closed'))).toBe(true);
		expect(isBrowserOriginError(new Error('Target page, context or browser has been closed'))).toBe(
			true
		);
		expect(isBrowserOriginError(new Error('Protocol error (Page.navigate): Session closed'))).toBe(
			true
		);
	});

	it('matches non-Error throws that mention the browser stack', () => {
		expect(isBrowserOriginError('camoufox: virtual display crashed')).toBe(true);
		expect(isBrowserOriginError({ toString: () => 'FFSession disconnected' })).toBe(true);
	});

	it('does NOT match ordinary application errors', () => {
		const appErr = errorWithStack(
			"Cannot read properties of undefined (reading 'url')",
			[
				"TypeError: Cannot read properties of undefined (reading 'url')",
				'    at parseRelease (/app/build/server/indexers/parser.js:12:5)',
				'    at SearchOrchestrator.rank (/app/build/server/indexers/search.js:88:9)'
			].join('\n')
		);
		expect(isBrowserOriginError(appErr)).toBe(false);
		expect(isBrowserOriginError(new Error('Invalid movie id'))).toBe(false);
		expect(isBrowserOriginError(new TypeError('foo is not a function'))).toBe(false);
	});

	it('handles null/undefined without throwing', () => {
		expect(isBrowserOriginError(null)).toBe(false);
		expect(isBrowserOriginError(undefined)).toBe(false);
	});
});

describe('installBrowserCrashGuard', () => {
	it('does not register process handlers under Vitest', () => {
		__resetBrowserCrashGuardForTests();
		const before = process.listenerCount('uncaughtException');
		installBrowserCrashGuard();
		const after = process.listenerCount('uncaughtException');
		expect(after).toBe(before);
	});
});
