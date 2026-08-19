import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

/**
 * Vite plugin that triggers eager initialization in dev mode.
 *
 * In dev mode, Vite lazily loads modules on first request. This means hooks.server.ts
 * (which contains service initialization) doesn't run until someone visits the site.
 * This plugin pings /health when the dev server starts, forcing SvelteKit to load
 * hooks.server.ts and start all background services immediately.
 */
function eagerInitPlugin(): Plugin {
	return {
		name: 'eager-init',
		configureServer(server) {
			server.httpServer?.once('listening', () => {
				// Small delay to ensure SvelteKit middleware is fully ready
				setTimeout(async () => {
					try {
						const address = server.httpServer?.address();
						if (address && typeof address === 'object') {
							const url = `http://localhost:${address.port}/health`;
							await fetch(url);
						}
					} catch {
						// Silently ignore - initialization will happen on first real request
					}
				}, 100);
			});
		}
	};
}

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'globalVariable', 'baseLocale']
		}),
		tailwindcss(),
		sveltekit(),
		eagerInitPlugin()
	],
	css: {
		transformer: 'postcss'
	},
	build: {
		cssMinify: 'lightningcss'
	},
	ssr: {
		// Externalize native modules that don't work with Vite's SSR bundling
		external: ['better-sqlite3']
	},
	test: {
		expect: { requireAssertions: true },
		setupFiles: ['src/test/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'lcov'],
			include: ['src/lib/**/*.ts'],
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/**/*.spec.ts',
				'src/lib/**/types.ts',
				'src/lib/paraglide/**'
			],
			thresholds: {
				statements: 23,
				branches: 16,
				functions: 23,
				lines: 23
			}
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/lib/components/**/*.test.ts', 'src/**/*.svelte.{test,spec}.{js,ts}'],
					fileParallelism: true,
					// First test in each file bears the full module + DB cold-start cost;
					// under concurrent load this can exceed the 5s default.
					testTimeout: 15000
				}
			},
			{
				extends: true,
				resolve: {
					// Component tests run against the client-side Svelte bundle; without the
					// browser condition, `svelte` resolves to the server entry and `mount()`
					// is unavailable.
					conditions: ['browser']
				},
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/lib/components/**/*.test.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					fileParallelism: true
				}
			}
		]
	}
});
