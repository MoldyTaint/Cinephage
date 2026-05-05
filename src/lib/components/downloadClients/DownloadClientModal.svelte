<script lang="ts">
	import { X } from 'lucide-svelte';
	import type {
		DownloadClient,
		DownloadClientFormData,
		DownloadClientImplementation,
		ConnectionTestResult
	} from '$lib/types/downloadClient';
	import { FolderBrowser } from '$lib/components/library';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { clientDefinitions } from './forms/clientDefinitions';
	import DownloadClientSettings from './forms/DownloadClientSettings.svelte';
	import ClientFormFields from './ClientFormFields.svelte';
	import ClientSpecificOptions from './ClientSpecificOptions.svelte';
	import ClientTestConnection from './ClientTestConnection.svelte';
	import { toFriendlyDownloadClientError } from '$lib/downloadClients/errorMessages';
	import * as m from '$lib/paraglide/messages.js';

	interface NntpServerFormData {
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

	interface NntpServer {
		id: string;
		name: string;
		host: string;
		port: number;
		useSsl: boolean | null;
		username: string | null;
		hasPassword?: boolean;
		maxConnections: number | null;
		priority: number | null;
		enabled: boolean | null;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		client?: DownloadClient | NntpServer | null;
		initialImplementation?: DownloadClientImplementation | 'nntp' | null;
		allowNntp?: boolean;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (
			data: DownloadClientFormData | NntpServerFormData,
			isNntp: boolean
		) => void | Promise<void>;
		onDelete?: () => void;
		onTest: (
			data: DownloadClientFormData | NntpServerFormData,
			isNntp: boolean
		) => Promise<ConnectionTestResult>;
		stalledTimeoutMinutes: number;
		stalledProgressThreshold: number;
		onSaveStalledBehavior: (timeout: number, threshold: number) => Promise<void>;
	}

	let {
		open,
		mode,
		client = null,
		initialImplementation = null,
		allowNntp = true,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest,
		stalledTimeoutMinutes,
		stalledProgressThreshold,
		onSaveStalledBehavior
	}: Props = $props();

	let implementation = $state<DownloadClientImplementation | ''>('');

	let name = $state('');
	let enabled = $state(true);
	let host = $state('localhost');
	let port = $state(8080);
	let useSsl = $state(false);
	let urlBase = $state('');
	let urlBaseEnabled = $state(false);
	let mountMode = $state<'nzbdav' | 'altmount' | ''>('');
	let username = $state('');
	let password = $state('');

	let movieCategory = $state('movies');
	let tvCategory = $state('tv');

	let recentPriority = $state<'normal' | 'high' | 'force'>('normal');
	let olderPriority = $state<'normal' | 'high' | 'force'>('normal');
	let initialState = $state<'start' | 'pause' | 'force'>('start');

	let downloadPathLocal = $state('');
	let downloadPathRemote = $state('');
	let tempPathLocal = $state('');
	let tempPathRemote = $state('');

	let priority = $state(1);

	let maxConnections = $state(10);

	let stalledTimeout = $state(0);
	let stalledThreshold = $state(0);
	let saveStalledBehaviorSuccess = $state(false);

	let testing = $state(false);
	let testResult = $state<ConnectionTestResult | null>(null);
	let showFolderBrowser = $state(false);
	let browsingField = $state<'downloadPathLocal' | 'tempPathLocal'>('downloadPathLocal');

	const modalTitle = $derived(
		mode === 'add' ? m.downloadClient_addDownloadClient() : m.downloadClient_editDownloadClient()
	);
	const hasPassword = $derived(client?.hasPassword ?? false);
	const selectedDefinition = $derived(
		implementation ? clientDefinitions.find((d) => d.id === implementation) : null
	);
	const visibleClientDefinitions = $derived(
		allowNntp ? clientDefinitions : clientDefinitions.filter((d) => d.id !== 'nntp')
	);
	const pickerClientDefinitions = $derived(visibleClientDefinitions);
	const usesApiKey = $derived(
		selectedDefinition?.protocol === 'usenet' && selectedDefinition?.id === 'sabnzbd'
	);
	const isNntpServer = $derived(implementation === 'nntp');
	const isSabnzbd = $derived(implementation === 'sabnzbd');
	const isMountModeClient = $derived(
		isSabnzbd && (mountMode === 'nzbdav' || mountMode === 'altmount')
	);
	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(name.length > MAX_NAME_LENGTH);
	const urlBasePlaceholder = $derived(
		(() => {
			switch (selectedDefinition?.id) {
				case 'sabnzbd':
					return 'sabnzbd';
				case 'nzbget':
					return 'nzbget';
				case 'qbittorrent':
					return 'qbittorrent';
				case 'transmission':
					return 'transmission';
				case 'deluge':
					return 'deluge';
				case 'rtorrent':
					return 'rutorrent';
				case 'aria2':
					return 'jsonrpc';
				default:
					return '';
			}
		})()
	);

	$effect(() => {
		if (open) {
			stalledTimeout = stalledTimeoutMinutes;
			stalledThreshold = stalledProgressThreshold;
			saveStalledBehaviorSuccess = false;
		}
	});

	$effect(() => {
		if (!open) return;
		const timeout = stalledTimeout;
		const threshold = stalledThreshold;

		if (timeout === stalledTimeoutMinutes && threshold === stalledProgressThreshold) return;

		const timer = setTimeout(async () => {
			try {
				await onSaveStalledBehavior(timeout, threshold);
				saveStalledBehaviorSuccess = true;
				setTimeout(() => (saveStalledBehaviorSuccess = false), 2000);
			} catch {
				// Revert to props on failure
			}
		}, 600);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (open) {
			const isNntpEdit = client && 'maxConnections' in client && !('movieCategory' in client);
			if (mode === 'add') {
				implementation = '';
			} else {
				implementation = isNntpEdit ? 'nntp' : ((client as DownloadClient)?.implementation ?? '');
			}
			name = client?.name ?? '';
			enabled = client?.enabled ?? true;
			host = client?.host ?? 'localhost';
			port = client?.port ?? (isNntpEdit ? 563 : 8080);
			useSsl = client?.useSsl ?? (isNntpEdit ? true : false);
			const clientUrlBase = (client as DownloadClient | undefined)?.urlBase ?? '';
			urlBase = clientUrlBase;
			urlBaseEnabled = !!clientUrlBase;
			const storedMountMode = (client as DownloadClient | undefined)?.mountMode ?? null;
			mountMode = storedMountMode === 'altmount' || storedMountMode === 'nzbdav' ? 'nzbdav' : '';
			username = client?.username ?? '';
			password = '';

			const dcClient = client as DownloadClient | undefined;
			movieCategory = dcClient?.movieCategory ?? 'movies';
			tvCategory = dcClient?.tvCategory ?? 'tv';
			recentPriority = dcClient?.recentPriority ?? 'normal';
			olderPriority = dcClient?.olderPriority ?? 'normal';
			initialState = dcClient?.initialState ?? 'start';
			downloadPathLocal = dcClient?.downloadPathLocal ?? '';
			downloadPathRemote = dcClient?.downloadPathRemote ?? '';
			tempPathLocal = dcClient?.tempPathLocal ?? '';
			tempPathRemote = dcClient?.tempPathRemote ?? '';

			const nntpClient = client as NntpServer | undefined;
			maxConnections = nntpClient?.maxConnections ?? 10;

			priority = client?.priority ?? 1;

			testResult = null;
			showFolderBrowser = false;

			if (mode === 'add' && initialImplementation) {
				handleImplementationChange(initialImplementation);
			}
		}
	});

	function handleImplementationChange(newImpl: DownloadClientImplementation | 'nntp') {
		if (!allowNntp && newImpl === 'nntp') {
			return;
		}

		implementation = newImpl as DownloadClientImplementation;
		if (mode === 'add') {
			const def = clientDefinitions.find((d) => d.id === newImpl);
			if (def) {
				port = def.defaultPort;
				name = def.name;
				if (newImpl === 'nntp') {
					useSsl = true;
				}
				if (newImpl === 'sabnzbd') {
					mountMode = '';
				}
			}
		}
	}

	function handleSslChange() {
		if (isNntpServer && mode === 'add') {
			port = useSsl ? 563 : 119;
		}
	}

	function getFormData(): DownloadClientFormData | NntpServerFormData {
		const normalizedUrlBase = urlBase.trim().replace(/^\/+|\/+$/g, '');
		const normalizedName = name.trim();
		const normalizedHost = host.trim();
		const normalizedUsername = username.trim();
		if (isNntpServer) {
			const data: NntpServerFormData = {
				name: normalizedName,
				host: normalizedHost,
				port,
				useSsl,
				username: normalizedUsername || null,
				password: password || null,
				maxConnections,
				priority,
				enabled
			};
			if (mode === 'edit' && !password) {
				delete (data as unknown as Record<string, unknown>).password;
			}
			return data;
		}

		const data: DownloadClientFormData = {
			name: normalizedName,
			implementation: implementation as DownloadClientImplementation,
			enabled,
			host: normalizedHost,
			port,
			useSsl,
			urlBase: urlBaseEnabled ? normalizedUrlBase || null : null,
			mountMode: implementation === 'sabnzbd' && mountMode ? 'nzbdav' : null,
			username: normalizedUsername || null,
			password: password || null,
			movieCategory,
			tvCategory,
			recentPriority,
			olderPriority,
			initialState,
			seedRatioLimit: null,
			seedTimeLimit: null,
			downloadPathLocal: downloadPathLocal || null,
			downloadPathRemote: downloadPathRemote || null,
			tempPathLocal: tempPathLocal || null,
			tempPathRemote: tempPathRemote || null,
			priority
		};
		if (mode === 'edit' && !password) {
			delete (data as unknown as Record<string, unknown>).password;
		}
		return data;
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			const result = await onTest(getFormData(), isNntpServer);
			testResult = result.success
				? result
				: {
						...result,
						error: toFriendlyDownloadClientError(result.error)
					};
		} finally {
			testing = false;
		}
	}

	function isValidPort(value: number): boolean {
		return Number.isInteger(value) && value >= 1 && value <= 65535;
	}

	function isFormValid(): boolean {
		return Boolean(
			implementation &&
			name.trim() &&
			name.trim().length <= MAX_NAME_LENGTH &&
			host.trim() &&
			isValidPort(port)
		);
	}

	async function handleSave() {
		const formData = getFormData();

		if (enabled) {
			testing = true;
			testResult = null;
			try {
				const result = await onTest(formData, isNntpServer);
				testResult = result.success
					? result
					: {
							...result,
							error: toFriendlyDownloadClientError(result.error)
						};
				if (!result.success) {
					return;
				}
			} finally {
				testing = false;
			}
		}

		await onSave(formData, isNntpServer);
	}

	function handleFolderSelect(path: string) {
		if (browsingField === 'tempPathLocal') {
			tempPathLocal = path;
		} else {
			downloadPathLocal = path;
		}
		showFolderBrowser = false;
	}

	function openFolderBrowser(field: 'downloadPathLocal' | 'tempPathLocal') {
		browsingField = field;
		showFolderBrowser = true;
	}

	function getProtocolLabel(protocol: 'torrent' | 'usenet' | 'nntp'): string {
		switch (protocol) {
			case 'torrent':
				return m.downloadClient_protocol_torrent();
			case 'usenet':
				return m.downloadClient_protocol_usenet();
			case 'nntp':
				return m.downloadClient_protocol_nntp();
		}
	}

	function getClientDescription(def: (typeof clientDefinitions)[number]): string {
		switch (def.id) {
			case 'qbittorrent':
				return m.downloadClient_desc_qbittorrent();
			case 'nntp':
				return m.downloadClient_desc_nntp();
			default:
				return def.description;
		}
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="download-client-modal-title">
	<div class="mb-6 flex items-center justify-between">
		<h3 id="download-client-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	{#if mode === 'add' && !implementation}
		<div class="space-y-4">
			<p class="text-base-content/70">{m.downloadClient_selectType()}</p>

			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
				{#each pickerClientDefinitions as def (def.id)}
					<button
						type="button"
						class="card cursor-pointer border-2 border-transparent bg-base-200 text-left transition-all hover:border-primary hover:bg-primary/10"
						onclick={() => handleImplementationChange(def.id)}
					>
						<div class="card-body p-4">
							<div class="flex items-start justify-between gap-2">
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<h3 class="font-semibold">{def.name}</h3>
										<span
											class="badge badge-sm {def.protocol === 'usenet'
												? 'badge-secondary'
												: 'badge-primary'}"
										>
											{getProtocolLabel(def.protocol)}
										</span>
									</div>
									<p class="mt-1 text-sm text-base-content/60">
										{getClientDescription(def)}
									</p>
								</div>
								<div class="badge badge-outline badge-sm">:{def.defaultPort}</div>
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<div class="modal-action">
			<button class="btn btn-ghost" onclick={onClose}>{m.action_cancel()}</button>
		</div>
	{:else}
		{#if mode === 'add' && selectedDefinition}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
				<div class="flex items-center gap-3">
					<div class="font-semibold">{selectedDefinition.name}</div>
					<div class="badge badge-ghost badge-sm">
						{m.common_port()}
						{selectedDefinition.defaultPort}
					</div>
				</div>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (implementation = '')}>
					{m.action_change()}
				</button>
			</div>
		{/if}

		{#if showFolderBrowser}
			<div class="mb-6">
				<FolderBrowser
					value={(browsingField === 'tempPathLocal' ? tempPathLocal : downloadPathLocal) || '/'}
					onSelect={handleFolderSelect}
					onCancel={() => (showFolderBrowser = false)}
				/>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
				<div class="space-y-4">
					<ClientFormFields
						bind:name
						bind:host
						bind:port
						bind:useSsl
						bind:enabled
						bind:username
						bind:password
						bind:urlBase
						bind:urlBaseEnabled
						bind:mountMode
						{isNntpServer}
						{usesApiKey}
						{isSabnzbd}
						{mode}
						{hasPassword}
						selectedDefinitionName={selectedDefinition?.name ?? ''}
						maxNameLength={MAX_NAME_LENGTH}
						{nameTooLong}
						{urlBasePlaceholder}
						onSslChange={handleSslChange}
					/>
				</div>

				<div class="space-y-4">
					<ClientSpecificOptions
						bind:maxConnections
						bind:priority
						bind:movieCategory
						bind:tvCategory
						bind:recentPriority
						bind:olderPriority
						bind:initialState
						bind:downloadPathLocal
						bind:downloadPathRemote
						bind:tempPathLocal
						bind:tempPathRemote
						bind:stalledTimeout
						bind:stalledThreshold
						bind:saveStalledBehaviorSuccess
						{isNntpServer}
						{selectedDefinition}
						{usesApiKey}
						{isMountModeClient}
						onBrowse={openFolderBrowser}
					/>
				</div>
			</div>

			{#if !isNntpServer}
				<div class="mt-6">
					<DownloadClientSettings
						section="paths"
						definition={selectedDefinition}
						bind:downloadPathLocal
						bind:downloadPathRemote
						bind:tempPathLocal
						bind:tempPathRemote
						isSabnzbd={usesApiKey}
						isMountMode={isMountModeClient}
						onBrowse={openFolderBrowser}
					/>
				</div>
			{/if}
		{/if}

		{#if !showFolderBrowser}
			<ClientTestConnection
				{testing}
				{testResult}
				{saving}
				{error}
				isFormValid={isFormValid()}
				{mode}
				onTest={handleTest}
				onSave={handleSave}
				{onClose}
				{onDelete}
			/>
		{/if}
	{/if}
</ModalWrapper>
