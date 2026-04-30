<script lang="ts">
	/**
	 * Base skeleton loader component with shimmer animation.
	 * Uses DaisyUI/Tailwind classes for styling.
	 *
	 * @example
	 * <Skeleton class="h-4 w-32" /> <!-- Text skeleton -->
	 * <Skeleton class="h-48 w-full rounded-lg" /> <!-- Card skeleton -->
	 * <Skeleton variant="circle" class="w-12 h-12" /> <!-- Avatar -->
	 */

	interface Props {
		/** Additional classes to apply */
		class?: string;
		/** Variant style: rect (default), circle, or text */
		variant?: 'rect' | 'circle' | 'text';
	}

	let { class: className = '', variant = 'rect' }: Props = $props();

	const variantClasses: Record<typeof variant, string> = {
		rect: 'rounded',
		circle: 'rounded-full',
		text: 'rounded h-4'
	};
</script>

<div
	class="skeleton {variantClasses[variant]} {className}"
	aria-hidden="true"
	role="presentation"
></div>
