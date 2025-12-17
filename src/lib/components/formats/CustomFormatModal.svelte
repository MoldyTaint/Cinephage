<script lang="ts">
	import type { FormatCondition, FormatCategory, UICustomFormat } from '$lib/types/format';
	import { FORMAT_CATEGORY_LABELS, FORMAT_CATEGORY_ORDER } from '$lib/types/format';
	import FormatConditionBuilder from './FormatConditionBuilder.svelte';
	import { X, Save, Loader2, FlaskConical, Check, AlertTriangle, Info } from 'lucide-svelte';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit' | 'view';
		format?: UICustomFormat | null;
		saving?: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: CustomFormatFormData) => void;
	}

	/**
	 * Form data for creating/updating custom formats
	 *
	 * Note: Formats no longer have defaultScore. Scores are defined per-profile
	 * in the profile's formatScores mapping.
	 */
	export interface CustomFormatFormData {
		name: string;
		description?: string;
		category: FormatCategory;
		tags: string[];
		conditions: FormatCondition[];
		enabled: boolean;
	}

	let {
		open,
		mode,
		format = null,
		saving = false,
		error = null,
		onClose,
		onSave
	}: Props = $props();

	// Form state
	let name = $state('');
	let description = $state('');
	let category = $state<FormatCategory>('other');
	let tagsInput = $state('');
	let conditions = $state<FormatCondition[]>([]);
	let enabled = $state(true);

	// Test state
	let testReleaseName = $state('');
	let testResult = $state<{ matched: boolean; details?: string } | null>(null);
	let testing = $state(false);

	// Initialize form when format changes
	$effect(() => {
		if (open) {
			if (format) {
				name = format.name;
				description = format.description || '';
				category = format.category;
				tagsInput = format.tags.join(', ');
				conditions = [...format.conditions];
				enabled = format.enabled;
			} else {
				// Reset form for new format
				name = '';
				description = '';
				category = 'other';
				tagsInput = '';
				conditions = [];
				enabled = true;
			}
			testReleaseName = '';
			testResult = null;
		}
	});

	function handleSave() {
		const tags = tagsInput
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t.length > 0);

		onSave({
			name,
			description: description || undefined,
			category,
			tags,
			conditions,
			enabled
		});
	}

	function handleConditionsUpdate(newConditions: FormatCondition[]) {
		conditions = newConditions;
	}

	async function testFormat() {
		if (!testReleaseName.trim()) return;

		testing = true;
		testResult = null;

		try {
			const response = await fetch('/api/custom-formats/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					releaseName: testReleaseName,
					conditions
				})
			});

			if (response.ok) {
				const data = await response.json();
				testResult = {
					matched: data.matched,
					details: data.matched
						? `Matched ${data.matchedConditions}/${data.totalConditions} conditions`
						: `Did not match. ${data.failedConditions} required conditions failed.`
				};
			} else {
				testResult = { matched: false, details: 'Test failed - check format conditions' };
			}
		} catch {
			testResult = { matched: false, details: 'Test request failed' };
		} finally {
			testing = false;
		}
	}

	const isReadonly = $derived(mode === 'view' || (format?.isBuiltIn ?? false));
	const modalTitle = $derived(
		mode === 'add' ? 'Create Custom Format' : format?.isBuiltIn ? 'View Format' : 'Edit Format'
	);
</script>

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-2xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button type="button" class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if error}
				<div class="mb-4 alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			{#if format?.isBuiltIn}
				<div class="mb-4 alert alert-info">
					<span>Built-in formats cannot be modified. Create a custom format to customize.</span>
				</div>
			{/if}

			<div class="space-y-4">
				<!-- Basic Info -->
				<div class="grid gap-4 sm:grid-cols-2">
					<!-- Name -->
					<div class="form-control">
						<label class="label" for="format-name">
							<span class="label-text">Name</span>
						</label>
						<input
							id="format-name"
							type="text"
							class="input-bordered input input-sm"
							bind:value={name}
							disabled={isReadonly}
							placeholder="My Custom Format"
						/>
					</div>

					<!-- Category -->
					<div class="form-control">
						<label class="label" for="format-category">
							<span class="label-text">Category</span>
						</label>
						<select
							id="format-category"
							class="select-bordered select select-sm"
							bind:value={category}
							disabled={isReadonly}
						>
							{#each FORMAT_CATEGORY_ORDER as cat}
								<option value={cat}>{FORMAT_CATEGORY_LABELS[cat]}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Description -->
				<div class="form-control">
					<label class="label" for="format-description">
						<span class="label-text">Description</span>
					</label>
					<textarea
						id="format-description"
						class="textarea-bordered textarea h-16 textarea-sm"
						bind:value={description}
						disabled={isReadonly}
						placeholder="Describe what this format matches..."
					></textarea>
				</div>

				<!-- Tags -->
				<div class="form-control">
					<label class="label" for="format-tags">
						<span class="label-text">Tags</span>
					</label>
					<input
						id="format-tags"
						type="text"
						class="input-bordered input input-sm"
						bind:value={tagsInput}
						disabled={isReadonly}
						placeholder="tag1, tag2, ..."
					/>
				</div>

				<!-- Score info -->
				<div class="alert bg-base-200 text-sm">
					<Info class="h-4 w-4" />
					<span>
						Format scores are defined per-profile. After creating this format, assign scores to it
						in your scoring profiles.
					</span>
				</div>

				<!-- Enabled toggle -->
				{#if !format?.isBuiltIn}
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input
								type="checkbox"
								class="toggle toggle-primary"
								bind:checked={enabled}
								disabled={isReadonly}
							/>
							<div>
								<span class="label-text">Enabled</span>
								<p class="text-xs text-base-content/60">
									Disabled formats won't be used for scoring
								</p>
							</div>
						</label>
					</div>
				{/if}

				<!-- Conditions -->
				<div class="divider">Conditions</div>

				<FormatConditionBuilder
					{conditions}
					readonly={isReadonly}
					onUpdate={handleConditionsUpdate}
				/>

				<!-- Test Section -->
				<div class="divider">Test</div>

				<div class="rounded-lg bg-base-200 p-4">
					<p class="mb-3 text-sm text-base-content/70">
						Test your conditions against a sample release name to verify they work correctly.
					</p>

					<div class="flex gap-2">
						<input
							type="text"
							class="input-bordered input input-sm flex-1 font-mono"
							bind:value={testReleaseName}
							placeholder="Movie.2024.2160p.BluRay.REMUX.HEVC.TrueHD.Atmos-GROUP"
						/>
						<button
							type="button"
							class="btn gap-1 btn-sm btn-secondary"
							onclick={testFormat}
							disabled={testing || conditions.length === 0}
						>
							{#if testing}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<FlaskConical class="h-4 w-4" />
							{/if}
							Test
						</button>
					</div>

					{#if testResult}
						<div
							class="mt-3 flex items-center gap-2 text-sm"
							class:text-success={testResult.matched}
							class:text-warning={!testResult.matched}
						>
							{#if testResult.matched}
								<Check class="h-4 w-4" />
							{:else}
								<AlertTriangle class="h-4 w-4" />
							{/if}
							<span>{testResult.matched ? 'Matched!' : 'Not matched'}</span>
							{#if testResult.details}
								<span class="text-base-content/60">- {testResult.details}</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-action mt-6 border-t border-base-300 pt-4">
				<button type="button" class="btn btn-ghost" onclick={onClose}>
					{isReadonly ? 'Close' : 'Cancel'}
				</button>
				{#if !isReadonly}
					<button
						type="button"
						class="btn gap-2 btn-primary"
						onclick={handleSave}
						disabled={saving || !name || conditions.length === 0}
					>
						{#if saving}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Save class="h-4 w-4" />
						{/if}
						Save
					</button>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
