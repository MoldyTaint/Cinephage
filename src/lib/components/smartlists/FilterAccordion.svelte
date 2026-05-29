<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		isOpen: boolean;
		onToggle: () => void;
		children: Snippet;
	}

	let { title, isOpen, onToggle, children }: Props = $props();
</script>

<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
	<input type="checkbox" checked={isOpen} onchange={onToggle} />
	<div class="collapse-title font-medium">{title}</div>
	<div class="collapse-content">
		{@render children()}
	</div>
</div>
