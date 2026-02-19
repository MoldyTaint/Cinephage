import type { SSEConnectionStatus } from '$lib/types/sse';

/**
 * Shared mobile-only SSE badge state.
 * Pages with SSE publish their status here; layout renders it in the mobile header.
 */
export const mobileSSEStatus = $state({
	source: null as string | null,
	status: 'disconnected' as SSEConnectionStatus,
	visible: false,
	publish(source: string, status: SSEConnectionStatus) {
		this.source = source;
		this.status = status;
		this.visible = true;
	},
	clear(source?: string) {
		if (source && this.source !== source) return;
		this.source = null;
		this.status = 'disconnected';
		this.visible = false;
	}
});
