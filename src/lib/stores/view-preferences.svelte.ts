import { browser } from '$app/environment';

const VIEW_MODE_KEY = 'library-view-mode';

export type ViewMode = 'grid' | 'list';

function getInitialViewMode(): ViewMode {
	if (browser) {
		const stored = sessionStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
		if (stored === 'grid' || stored === 'list') {
			return stored;
		}
	}
	return 'grid';
}

class ViewPreferencesStore {
	viewMode = $state<ViewMode>(getInitialViewMode());
	/** True once the client has resolved the stored preference. Use to avoid SSR flash. */
	isReady = $state(browser);

	setViewMode(mode: ViewMode) {
		this.viewMode = mode;
		if (browser) {
			sessionStorage.setItem(VIEW_MODE_KEY, mode);
		}
	}

	toggleViewMode() {
		this.setViewMode(this.viewMode === 'grid' ? 'list' : 'grid');
	}
}

export const viewPreferences = new ViewPreferencesStore();
