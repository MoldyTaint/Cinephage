<script lang="ts">
	import type { FormatCondition, ConditionType } from '$lib/types/format';
	import {
		CONDITION_TYPE_LABELS,
		CONDITION_TYPE_DESCRIPTIONS,
		AVAILABLE_RESOLUTIONS,
		RESOLUTION_LABELS,
		AVAILABLE_SOURCES,
		SOURCE_LABELS,
		AVAILABLE_CODECS,
		CODEC_LABELS,
		AVAILABLE_AUDIO,
		AUDIO_LABELS,
		AVAILABLE_HDR,
		HDR_LABELS,
		AVAILABLE_STREAMING_SERVICES,
		STREAMING_SERVICE_LABELS,
		AVAILABLE_FLAGS,
		FLAG_LABELS,
		FLAG_DESCRIPTIONS
	} from '$lib/types/format';
	import { Plus, Trash2, Info, AlertCircle } from 'lucide-svelte';

	interface Props {
		conditions: FormatCondition[];
		readonly?: boolean;
		onUpdate: (conditions: FormatCondition[]) => void;
	}

	let { conditions, readonly = false, onUpdate }: Props = $props();

	// Condition types available for selection
	const conditionTypes: ConditionType[] = [
		'resolution',
		'source',
		'codec',
		'audio',
		'hdr',
		'streaming_service',
		'flag',
		'release_title',
		'release_group'
	];

	function addCondition() {
		const newCondition: FormatCondition = {
			name: 'New Condition',
			type: 'resolution',
			required: true,
			negate: false,
			resolution: '1080p'
		};
		onUpdate([...conditions, newCondition]);
	}

	function removeCondition(index: number) {
		const updated = conditions.filter((_, i) => i !== index);
		onUpdate(updated);
	}

	function updateCondition(index: number, updates: Partial<FormatCondition>) {
		const updated = [...conditions];
		updated[index] = { ...updated[index], ...updates };

		// Clear type-specific fields when type changes
		if (updates.type) {
			const condition = updated[index];
			// Reset all type-specific fields
			delete condition.resolution;
			delete condition.source;
			delete condition.pattern;
			delete condition.codec;
			delete condition.audio;
			delete condition.hdr;
			delete condition.streamingService;
			delete condition.flag;

			// Set default for the new type
			switch (updates.type) {
				case 'resolution':
					condition.resolution = '1080p';
					break;
				case 'source':
					condition.source = 'bluray';
					break;
				case 'codec':
					condition.codec = 'h265';
					break;
				case 'audio':
					condition.audio = 'truehd';
					break;
				case 'hdr':
					condition.hdr = 'hdr10';
					break;
				case 'streaming_service':
					condition.streamingService = 'NF';
					break;
				case 'flag':
					condition.flag = 'isRemux';
					break;
				case 'release_title':
				case 'release_group':
					condition.pattern = '';
					break;
			}
		}

		onUpdate(updated);
	}

	function validateRegex(pattern: string): { valid: boolean; error?: string } {
		if (!pattern) return { valid: true };
		try {
			new RegExp(pattern);
			return { valid: true };
		} catch (e) {
			return { valid: false, error: e instanceof Error ? e.message : 'Invalid regex' };
		}
	}

	// Track regex validation per condition index
	let regexErrors = $state<Map<number, string>>(new Map());

	function handlePatternChange(index: number, pattern: string) {
		const result = validateRegex(pattern);
		if (!result.valid && result.error) {
			regexErrors.set(index, result.error);
		} else {
			regexErrors.delete(index);
		}
		regexErrors = new Map(regexErrors);
		updateCondition(index, { pattern });
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h4 class="font-medium">Conditions</h4>
		{#if !readonly}
			<button type="button" class="btn gap-1 btn-ghost btn-sm" onclick={addCondition}>
				<Plus class="h-4 w-4" />
				Add Condition
			</button>
		{/if}
	</div>

	{#if conditions.length === 0}
		<div class="rounded-lg bg-base-200 p-4 text-center text-sm text-base-content/60">
			No conditions defined. Add conditions to specify when this format should match.
		</div>
	{:else}
		<div class="space-y-3">
			{#each conditions as condition, index (index)}
				<div class="rounded-lg border border-base-300 bg-base-100 p-4">
					<div class="mb-3 flex items-start justify-between gap-2">
						<!-- Condition Name -->
						<input
							type="text"
							class="input-bordered input input-sm flex-1"
							value={condition.name}
							disabled={readonly}
							placeholder="Condition name"
							oninput={(e) => updateCondition(index, { name: e.currentTarget.value })}
						/>
						{#if !readonly}
							<button
								type="button"
								class="btn text-error btn-ghost btn-sm"
								onclick={() => removeCondition(index)}
								aria-label="Remove condition"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						{/if}
					</div>

					<div class="grid gap-3 sm:grid-cols-2">
						<!-- Condition Type -->
						<div class="form-control">
							<label class="label py-1" for="condition-type-{index}">
								<span class="label-text text-xs">Type</span>
								<span
									class="tooltip tooltip-left"
									data-tip={CONDITION_TYPE_DESCRIPTIONS[condition.type]}
								>
									<Info class="h-3 w-3 text-base-content/50" />
								</span>
							</label>
							<select
								id="condition-type-{index}"
								class="select-bordered select select-sm"
								value={condition.type}
								disabled={readonly}
								onchange={(e) =>
									updateCondition(index, { type: e.currentTarget.value as ConditionType })}
							>
								{#each conditionTypes as type}
									<option value={type}>{CONDITION_TYPE_LABELS[type]}</option>
								{/each}
							</select>
						</div>

						<!-- Type-specific value field -->
						<div class="form-control">
							<label class="label py-1" for="condition-value-{index}">
								<span class="label-text text-xs">Value</span>
							</label>

							{#if condition.type === 'resolution'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.resolution}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, {
											resolution: e.currentTarget.value as typeof condition.resolution
										})}
								>
									{#each AVAILABLE_RESOLUTIONS as res}
										<option value={res}>{RESOLUTION_LABELS[res]}</option>
									{/each}
								</select>
							{:else if condition.type === 'source'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.source}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, {
											source: e.currentTarget.value as typeof condition.source
										})}
								>
									{#each AVAILABLE_SOURCES as src}
										<option value={src}>{SOURCE_LABELS[src]}</option>
									{/each}
								</select>
							{:else if condition.type === 'codec'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.codec}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, {
											codec: e.currentTarget.value as typeof condition.codec
										})}
								>
									{#each AVAILABLE_CODECS as codec}
										<option value={codec}>{CODEC_LABELS[codec]}</option>
									{/each}
								</select>
							{:else if condition.type === 'audio'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.audio}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, {
											audio: e.currentTarget.value as typeof condition.audio
										})}
								>
									{#each AVAILABLE_AUDIO as audio}
										<option value={audio}>{AUDIO_LABELS[audio]}</option>
									{/each}
								</select>
							{:else if condition.type === 'hdr'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.hdr ?? 'sdr'}
									disabled={readonly}
									onchange={(e) => {
										const val = e.currentTarget.value;
										updateCondition(index, {
											hdr: val === 'sdr' ? null : (val as typeof condition.hdr)
										});
									}}
								>
									{#each AVAILABLE_HDR as hdr}
										<option value={hdr ?? 'sdr'}>{HDR_LABELS[hdr ?? 'sdr']}</option>
									{/each}
								</select>
							{:else if condition.type === 'streaming_service'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.streamingService}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, { streamingService: e.currentTarget.value })}
								>
									{#each AVAILABLE_STREAMING_SERVICES as service}
										<option value={service}>{STREAMING_SERVICE_LABELS[service]}</option>
									{/each}
								</select>
							{:else if condition.type === 'flag'}
								<select
									id="condition-value-{index}"
									class="select-bordered select select-sm"
									value={condition.flag}
									disabled={readonly}
									onchange={(e) =>
										updateCondition(index, {
											flag: e.currentTarget.value as typeof condition.flag
										})}
								>
									{#each AVAILABLE_FLAGS as flag}
										<option value={flag} title={FLAG_DESCRIPTIONS[flag]}>{FLAG_LABELS[flag]}</option
										>
									{/each}
								</select>
							{:else if condition.type === 'release_title' || condition.type === 'release_group'}
								<div class="relative">
									<input
										id="condition-value-{index}"
										type="text"
										class="input-bordered input input-sm w-full font-mono"
										class:input-error={regexErrors.has(index)}
										value={condition.pattern ?? ''}
										disabled={readonly}
										placeholder="Regex pattern..."
										oninput={(e) => handlePatternChange(index, e.currentTarget.value)}
									/>
									{#if regexErrors.has(index)}
										<div class="absolute top-1/2 right-2 -translate-y-1/2">
											<div
												class="tooltip tooltip-left tooltip-error"
												data-tip={regexErrors.get(index)}
											>
												<AlertCircle class="h-4 w-4 text-error" />
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Logic toggles -->
					<div class="mt-3 flex flex-wrap gap-4">
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={condition.required}
								disabled={readonly}
								onchange={(e) => updateCondition(index, { required: e.currentTarget.checked })}
							/>
							<span class="text-sm">Required</span>
							<span class="tooltip" data-tip="Condition MUST match for format to apply">
								<Info class="h-3 w-3 text-base-content/50" />
							</span>
						</label>

						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={condition.negate}
								disabled={readonly}
								onchange={(e) => updateCondition(index, { negate: e.currentTarget.checked })}
							/>
							<span class="text-sm">Negate</span>
							<span class="tooltip" data-tip="Invert match (must NOT match)">
								<Info class="h-3 w-3 text-base-content/50" />
							</span>
						</label>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Help text -->
	<div class="rounded-lg bg-base-200 p-3 text-xs text-base-content/70">
		<p class="mb-1 font-medium">Condition Logic:</p>
		<ul class="list-inside list-disc space-y-0.5">
			<li><strong>Required</strong> conditions must ALL match (AND logic)</li>
			<li><strong>Optional</strong> conditions: at least ONE must match (OR logic)</li>
			<li><strong>Negate</strong> inverts the match (must NOT match)</li>
		</ul>
	</div>
</div>
