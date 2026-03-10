export {
	auth,
	validateUsername,
	generateDisplayUsername,
	repairCurrentUserAdminRole
} from './auth.js';
export {
	ensureDefaultApiKeysForUser,
	ensureStreamingApiKeyRateLimit,
	getManagedApiKeysForRequest,
	getRecoverableApiKeyByType,
	regenerateRecoverableApiKey,
	type RecoverableApiKey,
	type ManagedApiKeyType
} from './api-keys.js';
export {
	HARD_RESERVED_USERNAMES,
	HARD_RESERVED_USERNAMES as RESERVED_USERNAMES,
	isHardReservedUsername,
	isValidUsernameFormat,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN
} from '$lib/auth/username-policy.js';
export { isSetupComplete, requireSetup } from './setup.js';
export {
	checkApiKeyPermission,
	requireApiKeyPermission,
	type Permission,
	type PermissionSet
} from './permissions.js';
export {
	isAdmin,
	requireAdmin,
	getUserRole,
	hasPermission,
	isAuthenticated,
	getUser,
	type UserRole
} from './authorization.js';
export {
	ac,
	admin,
	user,
	type UserRole as AccessControlUserRole
} from '$lib/auth/access-control.js';
export type { AuthType } from './auth.js';
