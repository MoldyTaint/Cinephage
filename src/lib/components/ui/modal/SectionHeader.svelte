<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		title: string;
		class?: string;
	}

	let { title, class: className = '' }: Props = $props();
</script>

<h4
	class="border-b border-base-300 pb-2 text-sm font-medium tracking-wide text-base-content/70 uppercase {className}"
>
	{title}
</h4>
