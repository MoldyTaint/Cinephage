<script lang="ts">
	import type { IndexerDefinition } from '$lib/types/indexer';
	import { SectionHeader, ToggleSetting } from '$lib/components/ui/modal';

	interface Props {
		definition: IndexerDefinition;
		name: string;
		priority: number;
		enabled: boolean;
		settings: Record<string, string>;
		enableAutomaticSearch: boolean;
		enableInteractiveSearch: boolean;
		onNameChange: (value: string) => void;
		onPriorityChange: (value: number) => void;
		onEnabledChange: (value: boolean) => void;
		onSettingsChange: (key: string, value: string) => void;
		onAutomaticSearchChange: (value: boolean) => void;
		onInteractiveSearchChange: (value: boolean) => void;
	}

	let {
		definition,
		name,
		priority,
		enabled,
		settings,
		enableAutomaticSearch,
		enableInteractiveSearch,
		onNameChange,
		onPriorityChange,
		onEnabledChange,
		onSettingsChange,
		onAutomaticSearchChange,
		onInteractiveSearchChange
	}: Props = $props();

	const textSettings = $derived(
		definition.settings?.filter((s) => s.type === 'text' || s.type === 'password') ?? []
	);

	const checkboxSettings = $derived(
		definition.settings?.filter((s) => s.type === 'checkbox') ?? []
	);
	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(name.length > MAX_NAME_LENGTH);
</script>

<div class="space-y-6">
	<!-- Basic Settings Row -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<div class="form-control">
			<label class="label py-1" for="streaming-name">
				<span class="label-text">Name</span>
			</label>
			<input
				id="streaming-name"
				type="text"
				class="input-bordered input input-sm"
				value={name}
				oninput={(e) => onNameChange(e.currentTarget.value)}
				maxlength={MAX_NAME_LENGTH}
				placeholder={definition.name ?? 'Streaming Indexer'}
			/>
			<div class="label py-1">
				<span class="label-text-alt text-xs {nameTooLong ? 'text-error' : 'text-base-content/60'}">
					{name.length}/{MAX_NAME_LENGTH}
				</span>
				{#if nameTooLong}
					<span class="label-text-alt text-xs text-error">Max {MAX_NAME_LENGTH} characters.</span>
				{/if}
			</div>
		</div>

		<div class="form-control">
			<label class="label py-1" for="streaming-priority">
				<span class="label-text">Priority</span>
				<span class="label-text-alt text-xs">1-100</span>
			</label>
			<input
				id="streaming-priority"
				type="number"
				class="input-bordered input input-sm"
				value={priority}
				oninput={(e) => onPriorityChange(parseInt(e.currentTarget.value) || 25)}
				min="1"
				max="100"
			/>
		</div>

		<div>
			<span class="block py-1 text-sm">Status</span>
			<label class="flex cursor-pointer items-center gap-2 py-2">
				<input
					type="checkbox"
					class="toggle shrink-0 toggle-primary toggle-sm"
					checked={enabled}
					onchange={(e) => onEnabledChange(e.currentTarget.checked)}
				/>
				<span class="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
			</label>
		</div>
	</div>

	<!-- Configuration Section (text inputs) -->
	{#if textSettings.length > 0}
		<div>
			<SectionHeader title="Configuration" />
			<div class="mt-2 space-y-3">
				{#each textSettings as setting (setting.name)}
					<div class="form-control">
						<label class="label py-1" for={`streaming-${setting.name}`}>
							<span class="label-text">{setting.label}</span>
						</label>
						<input
							type={setting.type === 'password' ? 'password' : 'text'}
							id={`streaming-${setting.name}`}
							class="input-bordered input input-sm"
							placeholder={setting.placeholder ?? setting.default ?? ''}
							value={settings[setting.name] ?? ''}
							oninput={(e) => onSettingsChange(setting.name, e.currentTarget.value)}
						/>
						{#if setting.helpText}
							<p class="label py-0">
								<span class="label-text-alt text-xs text-base-content/60">{setting.helpText}</span>
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Providers Section (checkboxes in grid) -->
	{#if checkboxSettings.length > 0}
		<div>
			<SectionHeader title="Streaming Providers" />
			<div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
				{#each checkboxSettings as setting (setting.name)}
					<label
						class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-base-200"
					>
						<input
							type="checkbox"
							class="checkbox checkbox-sm checkbox-primary"
							checked={settings[setting.name] === 'true' ||
								(settings[setting.name] === undefined && setting.default === 'true')}
							onchange={(e) =>
								onSettingsChange(setting.name, e.currentTarget.checked ? 'true' : 'false')}
						/>
						<div class="min-w-0">
							<span class="text-sm font-medium">{setting.label}</span>
							{#if setting.helpText}
								<p class="truncate text-xs text-base-content/50" title={setting.helpText}>
									{setting.helpText}
								</p>
							{/if}
						</div>
					</label>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Search Settings -->
	<div>
		<SectionHeader title="Search Settings" />
		<div class="mt-2 flex flex-wrap gap-x-8 gap-y-2">
			<ToggleSetting
				checked={enableAutomaticSearch}
				label="Automatic Search"
				description="Search when items are added or upgraded"
				onchange={() => onAutomaticSearchChange(!enableAutomaticSearch)}
			/>
			<ToggleSetting
				checked={enableInteractiveSearch}
				label="Interactive Search"
				description="Manual searches from the UI"
				onchange={() => onInteractiveSearchChange(!enableInteractiveSearch)}
			/>
		</div>
	</div>

	<!-- Streaming Info -->
	<div class="rounded-lg bg-info/10 p-4">
		<p class="text-sm text-base-content/70">
			Streaming provides instant playback via .strm files. No torrent client required.
		</p>
	</div>
</div>
