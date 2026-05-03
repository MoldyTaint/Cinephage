import type { MigrationDefinition } from '../migration-helpers.js';
// Versions 56-59 were used during the initial Better Auth rollout and later retired
// when auth schema ownership moved into the embedded table definitions above.
// Keep them as explicit no-ops so the migration ledger remains contiguous.

export const migration_v056: MigrationDefinition = {
	version: 56,
	name: 'reserved_better_auth_refactor_v56',
	apply: () => {}
};
