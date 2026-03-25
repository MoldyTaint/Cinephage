<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import { Loader2 } from 'lucide-svelte';

	interface Props {
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		variant?:
			| 'primary'
			| 'secondary'
			| 'accent'
			| 'ghost'
			| 'error'
			| 'success'
			| 'warning'
			| 'info';
		size?: 'xs' | 'sm' | 'md' | 'lg';
		class?: string;
		onclick?: () => void;
		children: Snippet;
		icon?: Snippet;
	}

	let {
		loading = false,
		disabled = false,
		type = 'button',
		variant = 'primary',
		size = 'md',
		class: className = '',
		onclick,
		children,
		icon
	}: Props = $props();

	const variantClasses = {
		primary: 'btn-primary',
		secondary: 'btn-secondary',
		accent: 'btn-accent',
		ghost: 'btn-ghost',
		error: 'btn-error',
		success: 'btn-success',
		warning: 'btn-warning',
		info: 'btn-info'
	};

	const sizeClasses = {
		xs: 'btn-xs',
		sm: 'btn-sm',
		md: '',
		lg: 'btn-lg'
	};
</script>

<button
	{type}
	class="btn gap-2 {variantClasses[variant]} {sizeClasses[size]} {className}"
	{onclick}
	disabled={disabled || loading}
>
	{#if loading}
		<Loader2 class="h-4 w-4 animate-spin" />
	{:else if icon}
		{@render icon()}
	{/if}
	{@render children()}
</button>
