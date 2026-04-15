export const layoutState = $state({
	isSidebarExpanded: true,
	mobileSseStatus: null as 'connected' | 'connecting' | 'error' | null,
	toggleSidebar() {
		this.isSidebarExpanded = !this.isSidebarExpanded;
	},
	setMobileSseStatus(status: 'connected' | 'connecting' | 'error' | null) {
		this.mobileSseStatus = status;
	},
	clearMobileSseStatus() {
		this.mobileSseStatus = null;
	}
});

export function deriveMobileSseStatus(connection: {
	isConnected: boolean;
	status: string;
}): 'connected' | 'connecting' | 'error' | null {
	if (connection.isConnected) {
		return 'connected';
	}
	if (connection.status === 'error') {
		return 'error';
	}
	if (connection.status === 'connecting') {
		return 'connecting';
	}
	return null;
}
