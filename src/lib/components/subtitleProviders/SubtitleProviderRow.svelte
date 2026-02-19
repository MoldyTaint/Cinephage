<script lang="ts">
	import { Loader2, FlaskConical, Settings, Trash2, ToggleLeft, ToggleRight } from 'lucide-svelte';
	import SubtitleProviderStatusBadge from './SubtitleProviderStatusBadge.svelte';
	import type { SubtitleProviderConfig } from '$lib/server/subtitles/types';
	import type { ProviderDefinition } from '$lib/server/subtitles/providers/interfaces';

	interface SubtitleProviderWithDefinition extends SubtitleProviderConfig {
		definitionName?: string;
		definition?: ProviderDefinition;
	}

	interface Props {
		provider: SubtitleProviderWithDefinition;
		testing: boolean;
		onEdit: (provider: SubtitleProviderWithDefinition) => void;
		onDelete: (provider: SubtitleProviderWithDefinition) => void;
		onTest: (provider: SubtitleProviderWithDefinition) => void;
		onToggle: (provider: SubtitleProviderWithDefinition) => void;
	}

	let { provider, testing, onEdit, onDelete, onTest, onToggle }: Props = $props();

	const surfacedFeatures = $derived.by(() => {
		const features = [...(provider.definition?.features ?? [])];

		if (features.length < 3) {
			if (provider.definition?.supportsHashSearch) {
				features.push('Hash matching');
			}
			if (provider.definition?.requiresApiKey || provider.definition?.accessType === 'api-key') {
				features.push('API access');
			}
			if (
				provider.definition?.requiresCredentials ||
				provider.definition?.accessType === 'free-account' ||
				provider.definition?.accessType === 'paid' ||
				provider.definition?.accessType === 'vip'
			) {
				features.push('Account auth');
			}
		}

		const unique = Array.from(new Set(features));
		const defaults = ['Subtitle search', 'Language matching', 'Provider API'];
		let idx = 0;
		while (unique.length < 3 && idx < defaults.length) {
			if (!unique.includes(defaults[idx])) {
				unique.push(defaults[idx]);
			}
			idx += 1;
		}

		return unique.slice(0, 3);
	});
</script>

<!-- Status -->
<td class="w-24">
	<SubtitleProviderStatusBadge
		enabled={provider.enabled}
		healthy={provider.consecutiveFailures === 0}
		consecutiveFailures={provider.consecutiveFailures}
		lastError={provider.lastError}
		throttledUntil={provider.throttledUntil}
	/>
</td>

<!-- Name -->
<td>
	<button class="link font-bold link-hover" onclick={() => onEdit(provider)}>
		{provider.name}
	</button>
</td>

<!-- Implementation -->
<td class="text-base-content/70">
	{provider.definitionName ?? provider.implementation}
</td>

<!-- Features -->
<td>
	<div class="flex flex-wrap gap-1">
		{#each surfacedFeatures as feature (feature)}
			<span class="badge badge-ghost badge-sm">{feature}</span>
		{/each}
	</div>
</td>

<!-- Priority -->
<td class="text-center">
	<span class="badge badge-outline badge-sm">{provider.priority}</span>
</td>

<!-- Rate Limit -->
<td class="text-center text-sm text-base-content/70">
	{provider.requestsPerMinute}/min
</td>

<!-- Actions -->
<td class="pl-2!">
	<div class="flex gap-0">
		<button
			class="btn btn-ghost btn-xs"
			onclick={() => onTest(provider)}
			disabled={testing}
			title="Test connection"
		>
			{#if testing}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<FlaskConical class="h-4 w-4" />
			{/if}
		</button>
		<button
			class="btn btn-ghost btn-xs"
			onclick={() => onToggle(provider)}
			disabled={testing}
			title={provider.enabled ? 'Disable' : 'Enable'}
		>
			{#if provider.enabled}
				<ToggleRight class="h-4 w-4 text-success" />
			{:else}
				<ToggleLeft class="h-4 w-4" />
			{/if}
		</button>
		<button class="btn btn-ghost btn-xs" onclick={() => onEdit(provider)} title="Edit provider">
			<Settings class="h-4 w-4" />
		</button>
		<button
			class="btn text-error btn-ghost btn-xs"
			onclick={() => onDelete(provider)}
			title="Delete provider"
		>
			<Trash2 class="h-4 w-4" />
		</button>
	</div>
</td>
