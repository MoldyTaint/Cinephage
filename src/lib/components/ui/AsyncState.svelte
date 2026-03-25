<script lang="ts">
	import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	type Status = 'idle' | 'loading' | 'success' | 'error' | 'warning';

	interface Props {
		status: Status;
		loadingText?: string;
		successText?: string;
		errorText?: string;
		warningText?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		showIcon?: boolean;
		inline?: boolean;
	}

	let {
		status,
		loadingText = m.common_loading(),
		successText = m.status_success(),
		errorText = m.status_error(),
		warningText = m.status_warning(),
		size = 'sm',
		showIcon = true,
		inline = false
	}: Props = $props();

	const iconSizes = {
		xs: 'h-3 w-3',
		sm: 'h-4 w-4',
		md: 'h-5 w-5',
		lg: 'h-6 w-6'
	};

	const textSizes = {
		xs: 'text-xs',
		sm: 'text-sm',
		md: 'text-base',
		lg: 'text-lg'
	};

	const statusConfig = $derived({
		idle: { icon: null, text: '', class: 'text-base-content/50' },
		loading: { icon: Loader2, text: loadingText, class: 'text-base-content' },
		success: { icon: CheckCircle, text: successText, class: 'text-success' },
		error: { icon: XCircle, text: errorText, class: 'text-error' },
		warning: { icon: AlertCircle, text: warningText, class: 'text-warning' }
	});

	const config = $derived(statusConfig[status]);
</script>

{#if status !== 'idle'}
	<div class="flex items-center gap-2 {config.class} {textSizes[size]}" class:inline-flex={inline}>
		{#if showIcon && config.icon}
			{@const Icon = config.icon}
			<Icon class="{iconSizes[size]} {status === 'loading' ? 'animate-spin' : ''}" />
		{/if}
		<span>{config.text}</span>
	</div>
{/if}
