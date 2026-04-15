// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
			supportId?: string;
		}
		interface Locals {
			/** Unique identifier for request tracing */
			correlationId: string;
			/** Canonical request identifier for structured logs */
			requestId: string;
			/** Safe user-facing identifier for support/debugging */
			supportId: string;
			/** Request-scoped logger */
			logger: import('$lib/logging').AppLogger;
			/** Current authenticated user (null if not logged in) */
			user: import('$lib/server/db/schema').UserRecord | null;
			/** Current session (null if not logged in) */
			session: import('$lib/server/db/schema').SessionRecord | null;
			/** API key used for authentication (null if not using API key) */
			apiKey: string | null;
			/** API key permissions if authenticated via API key (null otherwise) */
			apiKeyPermissions: Record<string, string[]> | null;
		}
		// interface PageData {}
		interface PageState {
			supportId?: string;
		}
		// interface Platform {}
	}
}

export {};
