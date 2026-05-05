<script lang="ts">
	import { randomUUID } from 'node:crypto';

	interface Props {
		minLabel: string;
		maxLabel: string;
		minValue: number | undefined;
		maxValue: number | undefined;
		minPlaceholder?: string;
		maxPlaceholder?: string;
		minMin?: number;
		minMax?: number;
		maxMin?: number;
		maxMax?: number;
		step?: string;
		onMinChange: (value: number | undefined) => void;
		onMaxChange: (value: number | undefined) => void;
	}

	let {
		minLabel,
		maxLabel,
		minValue,
		maxValue,
		minPlaceholder = '',
		maxPlaceholder = '',
		minMin,
		minMax,
		maxMin,
		maxMax,
		step,
		onMinChange,
		onMaxChange
	}: Props = $props();

	const id = randomUUID().slice(0, 8);

	function handleMinInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onMinChange(target.value ? Number(target.value) : undefined);
	}

	function handleMaxInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onMaxChange(target.value ? Number(target.value) : undefined);
	}
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	<div class="form-control">
		<label class="label py-1" for="{id}-min">
			<span class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase">
				{minLabel}
			</span>
		</label>
		<input
			type="number"
			id="{id}-min"
			value={minValue ?? ''}
			placeholder={minPlaceholder}
			min={minMin}
			max={minMax}
			{step}
			class="input-bordered input input-sm w-full"
			oninput={handleMinInput}
		/>
	</div>
	<div class="form-control">
		<label class="label py-1" for="{id}-max">
			<span class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase">
				{maxLabel}
			</span>
		</label>
		<input
			type="number"
			id="{id}-max"
			value={maxValue ?? ''}
			placeholder={maxPlaceholder}
			min={maxMin}
			max={maxMax}
			{step}
			class="input-bordered input input-sm w-full"
			oninput={handleMaxInput}
		/>
	</div>
</div>
