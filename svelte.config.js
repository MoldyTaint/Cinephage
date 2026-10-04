import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Explicit Node.js adapter for self-hosted deployment
		adapter: adapter(),
		// The CSP below matches the static fallback in
		// src/lib/server/security/headers.ts. SvelteKit renders an inline
		// bootstrap script on every SSR page, so script-src cannot drop
		// 'unsafe-inline' unless hashes are present; hash mode makes SvelteKit
		// emit the sha256 in the per-page CSP header it sets, which
		// hooks.server.ts preserves instead of overwriting.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'https:', 'http:'],
				'connect-src': ['self'],
				'font-src': ['self'],
				'media-src': ['self', 'blob:', 'https:', 'http:'],
				'object-src': ['none'],
				'child-src': ['self', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
				'frame-src': ['self', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
				'frame-ancestors': ['self']
			}
		},
		// SvelteKit's csrf.trustedOrigins uses Array.includes() — exact string match only,
		// wildcards like 'http://10.*:*' are never expanded and have no effect.
		// We disable the built-in check via '*' and implement proper origin validation in
		// hooks.server.ts using isLocalNetworkOrigin + BETTER_AUTH_TRUSTED_ORIGINS.
		csrf: {
			trustedOrigins: ['*']
		}
	},

	vitePlugin: {
		// Externalize native modules from Vite's SSR bundling
		inspector: false
	}
};

export default config;
