<script lang="ts">
	import { CheckCircle2, XCircle, Link, FileText, Globe } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import IptvOrgSelector from '../IptvOrgSelector.svelte';

	interface Props {
		name: string;
		inputMode: 'url' | 'file' | 'freeiptv';
		url: string;
		fileContent: string;
		fileName: string;
		selectedCountries: string[];
		epgUrl: string;
		autoRefresh: boolean;
		enabled: boolean;
		mode: 'add' | 'edit';
		onNameChange: (value: string) => void;
		onInputModeChange: (mode: 'url' | 'file' | 'freeiptv') => void;
		onUrlChange: (value: string) => void;
		onFileUpload: (content: string, name: string) => void;
		onCountriesChange: (countries: string[]) => void;
		onEpgUrlChange: (value: string) => void;
		onAutoRefreshChange: (value: boolean) => void;
		onEnabledChange: (value: boolean) => void;
	}

	let {
		name,
		inputMode,
		url,
		fileContent: _fileContent,
		fileName,
		selectedCountries,
		epgUrl,
		autoRefresh,
		enabled,
		mode,
		onNameChange,
		onInputModeChange,
		onUrlChange,
		onFileUpload,
		onCountriesChange,
		onEpgUrlChange,
		onAutoRefreshChange,
		onEnabledChange
	}: Props = $props();

	const isUrlValid = $derived(() => {
		if (inputMode !== 'url') return true;
		if (!url.trim()) return false;
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	});
	const isEpgUrlValid = $derived(() => {
		if (!epgUrl.trim()) return true;
		try {
			new URL(epgUrl);
			return true;
		} catch {
			return false;
		}
	});

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				onFileUpload(e.target?.result as string, file.name);
			};
			reader.readAsText(file);
		}
	}
</script>

<div class="space-y-4">
	<!-- Name (full width) -->
	<div class="form-control">
		<label class="label py-1" for="m3u-name">
			<span class="label-text">Name</span>
		</label>
		<input
			id="m3u-name"
			type="text"
			class="input-bordered input input-sm"
			value={name}
			oninput={(e) => onNameChange(e.currentTarget.value)}
			placeholder={inputMode === 'freeiptv' ? 'My Free IPTV Channels' : 'My M3U Playlist'}
		/>
		<div class="label py-1">
			<span class="label-text-alt text-xs">A friendly name for this collection</span>
		</div>
	</div>

	<!-- Input Mode Tabs (only when adding) -->
	{#if mode === 'add'}
		<div class="tabs-boxed tabs">
			<button
				class="tab {inputMode === 'url' ? 'tab-active' : ''}"
				onclick={() => onInputModeChange('url')}
			>
				<Link class="mr-2 inline h-4 w-4" />
				URL
			</button>
			<button
				class="tab {inputMode === 'file' ? 'tab-active' : ''}"
				onclick={() => onInputModeChange('file')}
			>
				<FileText class="mr-2 inline h-4 w-4" />
				File Upload
			</button>
			<button
				class="tab {inputMode === 'freeiptv' ? 'tab-active' : ''}"
				onclick={() => onInputModeChange('freeiptv')}
			>
				<Globe class="mr-2 inline h-4 w-4" />
				Free IPTV
			</button>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
		<!-- Left Column: Source -->
		<div class="space-y-4">
			<SectionHeader title="Playlist Source" />

			{#if inputMode === 'url'}
				<div class="form-control">
					<label class="label py-1" for="m3u-url">
						<span class="label-text">M3U Playlist URL</span>
					</label>
					<div class="relative">
						<input
							id="m3u-url"
							type="url"
							class="input-bordered input input-sm w-full pr-8"
							class:input-error={url.length > 0 && !isUrlValid()}
							value={url}
							oninput={(e) => onUrlChange(e.currentTarget.value)}
							placeholder="http://example.com/playlist.m3u"
						/>
						{#if url.length > 0}
							<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
								{#if isUrlValid()}
									<CheckCircle2 class="h-4 w-4 text-success" />
								{:else}
									<XCircle class="h-4 w-4 text-error" />
								{/if}
							</div>
						{/if}
					</div>
					<div class="label py-1">
						<span class="label-text-alt text-xs">Direct link to M3U playlist file</span>
					</div>
				</div>
			{:else if inputMode === 'file'}
				<div class="form-control">
					<label class="label py-1" for="m3u-file">
						<span class="label-text">Upload M3U File</span>
					</label>
					<input
						id="m3u-file"
						type="file"
						accept=".m3u,.m3u8"
						class="file-input-bordered file-input flex-1 file-input-sm"
						onchange={handleFileUpload}
					/>
					{#if fileName}
						<div class="label py-1">
							<span class="label-text-alt text-xs text-success">Loaded: {fileName}</span>
						</div>
					{:else}
						<div class="label py-1">
							<span class="label-text-alt text-xs">Select an M3U or M3U8 file</span>
						</div>
					{/if}
				</div>
			{:else}
				<IptvOrgSelector {selectedCountries} onChange={onCountriesChange} />
			{/if}
		</div>

		<!-- Right Column: Settings -->
		<div class="space-y-4">
			<SectionHeader title="Settings" />

			{#if inputMode === 'url'}
				<div class="form-control">
					<label class="label py-1" for="epg-url">
						<span class="label-text">EPG URL (Optional)</span>
					</label>
					<div class="relative">
						<input
							id="epg-url"
							type="url"
							class="input-bordered input input-sm w-full pr-8"
							class:input-error={epgUrl.length > 0 && !isEpgUrlValid()}
							value={epgUrl}
							oninput={(e) => onEpgUrlChange(e.currentTarget.value)}
							placeholder="http://example.com/epg.xml"
						/>
						{#if epgUrl.length > 0}
							<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
								{#if isEpgUrlValid()}
									<CheckCircle2 class="h-4 w-4 text-success" />
								{:else}
									<XCircle class="h-4 w-4 text-error" />
								{/if}
							</div>
						{/if}
					</div>
					<div class="label py-1">
						<span class="label-text-alt text-xs">XMLTV EPG URL for program guide data</span>
					</div>
				</div>

				<label class="label cursor-pointer gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={autoRefresh}
						onchange={(e) => onAutoRefreshChange(e.currentTarget.checked)}
					/>
					<span class="label-text">Auto-refresh playlist</span>
				</label>
			{:else if inputMode === 'file'}
				<div class="form-control">
					<label class="label py-1" for="epg-url">
						<span class="label-text">EPG URL (Optional)</span>
					</label>
					<div class="relative">
						<input
							id="epg-url"
							type="url"
							class="input-bordered input input-sm w-full pr-8"
							class:input-error={epgUrl.length > 0 && !isEpgUrlValid()}
							value={epgUrl}
							oninput={(e) => onEpgUrlChange(e.currentTarget.value)}
							placeholder="http://example.com/epg.xml"
						/>
						{#if epgUrl.length > 0}
							<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
								{#if isEpgUrlValid()}
									<CheckCircle2 class="h-4 w-4 text-success" />
								{:else}
									<XCircle class="h-4 w-4 text-error" />
								{/if}
							</div>
						{/if}
					</div>
					<div class="label py-1">
						<span class="label-text-alt text-xs">XMLTV EPG URL for program guide data</span>
					</div>
				</div>
			{/if}

			<label class="label cursor-pointer gap-2">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={enabled}
					onchange={(e) => onEnabledChange(e.currentTarget.checked)}
				/>
				<span class="label-text">Enabled</span>
			</label>
		</div>
	</div>
</div>
