import { browser } from '$app/environment';

const VIEW_MODE_KEY = 'library-view-mode';
const GROUP_BY_COLLECTION_KEY = 'library-group-by-collection';

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

function getInitialGroupByCollection(): boolean {
	if (browser) {
		return sessionStorage.getItem(GROUP_BY_COLLECTION_KEY) === 'true';
	}
	return false;
}

class ViewPreferencesStore {
	viewMode = $state<ViewMode>(getInitialViewMode());
	groupByCollection = $state(getInitialGroupByCollection());
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

	setGroupByCollection(grouped: boolean) {
		this.groupByCollection = grouped;
		if (browser) {
			sessionStorage.setItem(GROUP_BY_COLLECTION_KEY, String(grouped));
		}
	}

	toggleGroupByCollection() {
		this.setGroupByCollection(!this.groupByCollection);
	}
}

export const viewPreferences = new ViewPreferencesStore();
