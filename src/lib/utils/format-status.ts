import * as m from '$lib/paraglide/messages.js';

export function formatSeriesStatus(status: string | null): string {
	if (!status) return m.common_unknown();
	const s = status.toLowerCase();
	if (s.includes('returning')) return m.library_libraryMediaTable_continuing();
	if (s.includes('production')) return m.library_libraryMediaTable_inProduction();
	if (s.includes('ended')) return m.library_libraryMediaTable_ended();
	if (s.includes('canceled')) return m.library_libraryMediaTable_cancelled();
	return status;
}
