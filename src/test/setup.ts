import { vi } from 'vitest';

// Check if we're in a Node.js environment (server tests)
const isNode = typeof process !== 'undefined' && process.versions?.node;

if (isNode) {
	// Load dotenv synchronously for server tests
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require('dotenv').config();

	// Mock $env/dynamic/private
	vi.mock('$env/dynamic/private', () => ({
		env: process.env
	}));
}

// Note: Subtitle providers are registered via ensureProvidersRegistered()
// which is called by the SubtitleProviderFactory when needed.
