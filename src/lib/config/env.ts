/**
 * Runtime environment variable access.
 * Consistent across server and client (where possible).
 */

export function getRuntimeEnv(key: string): string | undefined {
	// 1. Check Vite's import.meta.env (static at build time, but can be dynamic if configured)
	const viteEnv = (import.meta.env as Record<string, unknown> | undefined)?.[key];
	if (typeof viteEnv === 'string') {
		return viteEnv;
	}

	// 2. Check Vite's VITE_ prefixed env (standard SvelteKit/Vite way)
	const prefixedViteEnv = (import.meta.env as Record<string, unknown> | undefined)?.[`VITE_${key}`];
	if (typeof prefixedViteEnv === 'string') {
		return prefixedViteEnv;
	}

	// 3. Check Node.js process.env (runtime in container/server)
	if (typeof process !== 'undefined') {
		return process.env?.[key];
	}

	return undefined;
}

export function isDev(): boolean {
	try {
		return import.meta.env?.DEV ?? getRuntimeEnv('NODE_ENV') === 'development';
	} catch {
		return false;
	}
}
