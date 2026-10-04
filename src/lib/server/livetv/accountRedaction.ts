/**
 * Live TV account response redaction.
 *
 * Provider configs carry portal credentials (stalker token/password, Xtream
 * password/auth token). API responses never ship them: the edit form omits
 * unchanged secrets and the test endpoint resolves stored values server-side
 * by accountId, so `[REDACTED]` round-trips cleanly. Usernames stay visible —
 * the edit form prefills them and they double as account identifiers.
 */

import { REDACTED_VALUE } from '$lib/shared/sensitiveSettings';
import type { LiveTvAccount } from '$lib/types/livetv';

function redact(value: string | undefined): string | undefined {
	return value ? REDACTED_VALUE : value;
}

export function redactAccountSecrets(account: LiveTvAccount): LiveTvAccount {
	if (account.stalkerConfig) {
		account = {
			...account,
			stalkerConfig: {
				...account.stalkerConfig,
				token: redact(account.stalkerConfig.token),
				password: redact(account.stalkerConfig.password)
			}
		};
	}
	if (account.xstreamConfig) {
		account = {
			...account,
			xstreamConfig: {
				...account.xstreamConfig,
				password: redact(account.xstreamConfig.password) ?? '',
				authToken: redact(account.xstreamConfig.authToken)
			}
		};
	}
	return account;
}
