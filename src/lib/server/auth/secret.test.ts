import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
	'BETTER_AUTH_SECRET',
	'BETTER_AUTH_URL',
	'ORIGIN',
	'VITE_SSR_BUILD',
	'VITEST',
	'NODE_ENV'
] as const;

let originalEnv: Record<(typeof KEYS)[number], string | undefined>;

async function loadSecretModule() {
	vi.resetModules();
	return import('./secret.ts');
}

function resetAuthEnv() {
	for (const key of KEYS) {
		delete process.env[key];
	}
}

describe('getAuthSecret', () => {
	beforeEach(() => {
		originalEnv = {
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
			BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
			ORIGIN: process.env.ORIGIN,
			VITE_SSR_BUILD: process.env.VITE_SSR_BUILD,
			VITEST: process.env.VITEST,
			NODE_ENV: process.env.NODE_ENV
		};
		resetAuthEnv();
	});

	afterEach(() => {
		resetAuthEnv();
		for (const key of KEYS) {
			const value = originalEnv[key];
			if (value !== undefined) {
				process.env[key] = value;
			}
		}
	});

	it('returns BETTER_AUTH_SECRET when explicitly provided', async () => {
		process.env.BETTER_AUTH_SECRET = 'explicit-secret';
		const mod = await loadSecretModule();
		expect(mod.getAuthSecret()).toBe('explicit-secret');
	});

	it('returns build placeholder in SSR build context', async () => {
		process.env.VITE_SSR_BUILD = '1';
		const mod = await loadSecretModule();
		expect(mod.getAuthSecret()).toBe('build-time-placeholder-do-not-use-in-production');
	});

	it('returns build placeholder in vitest context', async () => {
		process.env.VITEST = 'true';
		const mod = await loadSecretModule();
		expect(mod.getAuthSecret()).toBe('build-time-placeholder-do-not-use-in-production');
	});

	it('throws in runtime when BETTER_AUTH_SECRET is missing', async () => {
		process.env.NODE_ENV = 'production';
		const mod = await loadSecretModule();
		expect(() => mod.getAuthSecret()).toThrowError(/BETTER_AUTH_SECRET is not set/);
	});
});

describe('getBaseURL', () => {
	beforeEach(() => {
		originalEnv = {
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
			BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
			ORIGIN: process.env.ORIGIN,
			VITE_SSR_BUILD: process.env.VITE_SSR_BUILD,
			VITEST: process.env.VITEST,
			NODE_ENV: process.env.NODE_ENV
		};
		resetAuthEnv();
	});

	afterEach(() => {
		resetAuthEnv();
		for (const key of KEYS) {
			const value = originalEnv[key];
			if (value !== undefined) {
				process.env[key] = value;
			}
		}
	});

	it('prefers BETTER_AUTH_URL over ORIGIN', async () => {
		process.env.BETTER_AUTH_URL = 'http://auth.example.com/';
		process.env.ORIGIN = 'http://origin.example.com/';
		const mod = await loadSecretModule();
		expect(mod.getBaseURL()).toBe('http://auth.example.com');
	});

	it('falls back to ORIGIN when BETTER_AUTH_URL is unset', async () => {
		process.env.ORIGIN = 'http://192.168.1.6:3000/';
		const mod = await loadSecretModule();
		expect(mod.getBaseURL()).toBe('http://192.168.1.6:3000');
	});
});
