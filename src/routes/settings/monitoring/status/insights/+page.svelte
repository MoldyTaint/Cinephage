<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import InsightsPanel from '$lib/components/storage/InsightsPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const activeInsights = $derived(data.allInsights.filter((i) => !i.dismissedAt));
	const dismissedInsights = $derived(data.allInsights.filter((i) => i.dismissedAt));
</script>

<svelte:head>
	<title>{m.status_insights_title()}</title>
</svelte:head>

<SettingsPage title={m.status_insights_title()} subtitle={m.status_insights_subtitle()}>
	<SettingsSection title="Active">
		<InsightsPanel insights={activeInsights} />
	</SettingsSection>

	{#if dismissedInsights.length > 0}
		<SettingsSection title="Dismissed">
			<InsightsPanel insights={dismissedInsights} />
		</SettingsSection>
	{/if}
</SettingsPage>
