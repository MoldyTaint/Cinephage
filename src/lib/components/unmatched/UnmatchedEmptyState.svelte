<script lang="ts">
	import { CheckCircle } from 'lucide-svelte';
</script>

<div class="card bg-base-200">
	<div class="card-body items-center py-12 text-center">
		<div class="rounded-full bg-success/10 p-4">
			<CheckCircle class="h-12 w-12 text-success" />
		</div>
		<h2 class="mt-4 card-title">All Files Matched</h2>
		<p class="text-base-content/70">No unmatched files in your library. Everything is organized!</p>
	</div>
</div>
