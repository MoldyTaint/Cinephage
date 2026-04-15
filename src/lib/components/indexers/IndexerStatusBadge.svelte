<script lang="ts">
	import { AlertTriangle, CheckCircle, XCircle } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		enabled: boolean;
		consecutiveFailures?: number;
		lastFailure?: string;
		disabledUntil?: string;
	}

	let { enabled, consecutiveFailures = 0, lastFailure, disabledUntil }: Props = $props();

	const hasFailures = $derived(consecutiveFailures > 0);
	const isAutoDisabled = $derived(!!disabledUntil && new Date(disabledUntil) > new Date());

	const statusInfo = $derived.by(() => {
		if (!enabled) {
			return {
				text: m.settings_indexers_status_disabled(),
				class: 'badge-ghost',
				icon: XCircle,
				tooltip: m.settings_indexers_tooltip_disabled()
			};
		}
		if (isAutoDisabled) {
			const until = disabledUntil ? new Date(disabledUntil).toLocaleString() : m.common_unknown();
			return {
				text: m.settings_indexers_status_unhealthy(),
				class: 'badge-error',
				icon: AlertTriangle,
				tooltip: m.settings_indexers_tooltip_unhealthy({ until, consecutiveFailures })
			};
		}
		if (hasFailures) {
			const failureTime = lastFailure ? new Date(lastFailure).toLocaleString() : m.common_unknown();
			return {
				text: m.settings_indexers_status_degraded(),
				class: 'badge-warning',
				icon: AlertTriangle,
				tooltip: m.settings_indexers_tooltip_degraded({ consecutiveFailures, failureTime })
			};
		}
		return {
			text: m.settings_indexers_status_healthy(),
			class: 'badge-success',
			icon: CheckCircle,
			tooltip: m.settings_indexers_tooltip_healthy()
		};
	});

	const Icon = $derived(statusInfo.icon);
</script>

<div class="tooltip tooltip-right" data-tip={statusInfo.tooltip}>
	<div class="badge gap-1 {statusInfo.class}">
		<Icon class="h-3 w-3" />
		<span class="text-xs">{statusInfo.text}</span>
	</div>
</div>
