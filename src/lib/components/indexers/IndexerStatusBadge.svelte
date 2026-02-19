<script lang="ts">
	import { AlertTriangle, CheckCircle, XCircle } from 'lucide-svelte';

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
				text: 'Disabled',
				class: 'badge-ghost',
				icon: XCircle,
				tooltip: 'Indexer is disabled by user'
			};
		}
		if (isAutoDisabled) {
			const until = disabledUntil ? new Date(disabledUntil).toLocaleString() : 'Unknown';
			return {
				text: 'Unhealthy',
				class: 'badge-error',
				icon: AlertTriangle,
				tooltip: `Auto-disabled until ${until} due to ${consecutiveFailures} consecutive failures`
			};
		}
		if (hasFailures) {
			const failureTime = lastFailure ? new Date(lastFailure).toLocaleString() : 'Unknown';
			return {
				text: 'Degraded',
				class: 'badge-warning',
				icon: AlertTriangle,
				tooltip: `${consecutiveFailures} consecutive failure(s). Last failure: ${failureTime}`
			};
		}
		return {
			text: 'Healthy',
			class: 'badge-success',
			icon: CheckCircle,
			tooltip: 'Indexer is healthy and operational'
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
