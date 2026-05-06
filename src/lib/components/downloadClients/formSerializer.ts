import type {
	DownloadClientFormData,
	DownloadClientImplementation,
	DownloadClientMountMode,
	DownloadPriority,
	DownloadInitialState
} from '$lib/types/downloadClient';

export interface NntpServerFormData {
	name: string;
	host: string;
	port: number;
	useSsl: boolean;
	username: string | null;
	password: string | null;
	maxConnections: number;
	priority: number;
	enabled: boolean;
}

export interface DownloadClientFormState {
	name: string;
	enabled: boolean;
	host: string;
	port: number;
	useSsl: boolean;
	urlBase: string;
	urlBaseEnabled: boolean;
	mountMode: DownloadClientMountMode | '';
	username: string;
	password: string;
	movieCategory: string;
	tvCategory: string;
	recentPriority: DownloadPriority;
	olderPriority: DownloadPriority;
	initialState: DownloadInitialState;
	downloadPathLocal: string;
	downloadPathRemote: string;
	tempPathLocal: string;
	tempPathRemote: string;
	maxConnections: number;
	priority: number;
	implementation: DownloadClientImplementation;
}

export function serializeDownloadClientForm(
	formState: DownloadClientFormState,
	isNntpServer: boolean,
	mode: 'add' | 'edit'
): DownloadClientFormData | NntpServerFormData {
	const normalizedUrlBase = formState.urlBase.trim().replace(/^\/+|\/+$/g, '');
	const normalizedName = formState.name.trim();
	const normalizedHost = formState.host.trim();
	const normalizedUsername = formState.username.trim();

	if (isNntpServer) {
		const data: NntpServerFormData = {
			name: normalizedName,
			host: normalizedHost,
			port: formState.port,
			useSsl: formState.useSsl,
			username: normalizedUsername || null,
			password: formState.password || null,
			maxConnections: formState.maxConnections,
			priority: formState.priority,
			enabled: formState.enabled
		};
		if (mode === 'edit' && !formState.password) {
			delete (data as unknown as Record<string, unknown>).password;
		}
		return data;
	}

	const data: DownloadClientFormData = {
		name: normalizedName,
		implementation: formState.implementation,
		enabled: formState.enabled,
		host: normalizedHost,
		port: formState.port,
		useSsl: formState.useSsl,
		urlBase: formState.urlBaseEnabled ? normalizedUrlBase || null : null,
		mountMode: formState.implementation === 'sabnzbd' && formState.mountMode ? 'nzbdav' : null,
		username: normalizedUsername || null,
		password: formState.password || null,
		movieCategory: formState.movieCategory,
		tvCategory: formState.tvCategory,
		recentPriority: formState.recentPriority,
		olderPriority: formState.olderPriority,
		initialState: formState.initialState,
		seedRatioLimit: null,
		seedTimeLimit: null,
		downloadPathLocal: formState.downloadPathLocal || null,
		downloadPathRemote: formState.downloadPathRemote || null,
		tempPathLocal: formState.tempPathLocal || null,
		tempPathRemote: formState.tempPathRemote || null,
		priority: formState.priority
	};
	if (mode === 'edit' && !formState.password) {
		delete (data as unknown as Record<string, unknown>).password;
	}
	return data;
}
