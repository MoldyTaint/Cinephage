<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	onMount(() => {
		window.location.replace('/settings/system/general');
	});
</script>

<div class="flex min-h-[60vh] items-center justify-center">
	<div class="text-center">
		<p class="text-base-content/70">{m.settings_profiles_redirecting()}</p>
	</div>
</div>
