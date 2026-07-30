/**
 * Pick the log level for a grab rejection based on whether the grab was
 * user-initiated (interactive) or part of an automated search.
 *
 * Interactive grabs log at warn because the user explicitly requested the
 * release and will want to know why it was rejected. Automated searches
 * iterate many releases, so per-rejection logging stays at debug to avoid
 * flooding production logs; callers aggregate a summary at info instead.
 */
export function grabRejectionLogLevel(isAutomatic: boolean): 'warn' | 'debug' {
	return isAutomatic ? 'debug' : 'warn';
}
