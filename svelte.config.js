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
				'https://10.*:*',
				'http://172.16.*:*',
				'https://172.16.*:*',
				'http://172.17.*:*',
				'https://172.17.*:*',
				'http://172.18.*:*',
				'https://172.18.*:*',
				'http://172.19.*:*',
				'https://172.19.*:*',
				'http://172.20.*:*',
				'https://172.20.*:*',
				'http://172.21.*:*',
				'https://172.21.*:*',
				'http://172.22.*:*',
				'https://172.22.*:*',
				'http://172.23.*:*',
				'https://172.23.*:*',
				'http://172.24.*:*',
				'https://172.24.*:*',
				'http://172.25.*:*',
				'https://172.25.*:*',
				'http://172.26.*:*',
				'https://172.26.*:*',
				'http://172.27.*:*',
				'https://172.27.*:*',
				'http://172.28.*:*',
				'https://172.28.*:*',
				'http://172.29.*:*',
				'https://172.29.*:*',
				'http://172.30.*:*',
				'https://172.30.*:*',
				'http://172.31.*:*',
				'https://172.31.*:*',
				'http://192.168.*:*',
				'https://192.168.*:*'
			]
		}
	},

	vitePlugin: {
		// Externalize native modules from Vite's SSR bundling
		inspector: false
	}
};

export default config;
