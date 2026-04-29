<script lang="ts">
	import type { ActivityCategoryTag } from './activity-display-utils.js';

	interface Props {
		tag: ActivityCategoryTag;
	}

	let { tag }: Props = $props();
</script>

<span class="badge {tag.variant} opacity-70">{tag.label}</span>
