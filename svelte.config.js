import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Explicit Node.js adapter for self-hosted deployment
		adapter: adapter({
			// Externalize native modules that can't be bundled
			external: ['better-sqlite3']
		}),
		// Allow self-hosted access via LAN IPs and local hostnames.
		// SvelteKit's default CSRF protection requires the Origin header to match
		// the server's host. For LAN apps accessed via IP or custom hostnames,
		// we explicitly list common private-network patterns.
		csrf: {
			trustedOrigins: [
				'http://localhost:*',
				'https://localhost:*',
				'http://127.0.0.1:*',
				'https://127.0.0.1:*',
				'http://[::1]:*',
				'https://[::1]:*',
				'http://10.*:*',
				'http://172.16.*:*',
				'http://172.17.*:*',
				'http://172.18.*:*',
				'http://172.19.*:*',
				'http://172.20.*:*',
				'http://172.21.*:*',
				'http://172.22.*:*',
				'http://172.23.*:*',
				'http://172.24.*:*',
				'http://172.25.*:*',
				'http://172.26.*:*',
				'http://172.27.*:*',
				'http://172.28.*:*',
				'http://172.29.*:*',
				'http://172.30.*:*',
				'http://172.31.*:*',
				'http://192.168.*:*'
			]
		}
	},

	vitePlugin: {
		// Externalize native modules from Vite's SSR bundling
		inspector: false
	}
};

export default config;
