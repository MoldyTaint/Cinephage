<script lang="ts">
	import type { ScoringProfile } from '$lib/types/profile';
	import { Settings, Trash2, Lock, Star, Check, Film, Tv, Sliders } from 'lucide-svelte';

	interface Props {
		profiles: ScoringProfile[];
		onEdit: (profile: ScoringProfile) => void;
		onDelete: (profile: ScoringProfile) => void;
		onSetDefault: (profile: ScoringProfile) => void;
	}

	let { profiles, onEdit, onDelete, onSetDefault }: Props = $props();

	// Format size limit display
	function formatMovieSize(profile: ScoringProfile): string {
		const min = profile.movieMinSizeGb;
		const max = profile.movieMaxSizeGb;
		if (min && max) return `${min} - ${max} GB`;
		if (min) return `${min}+ GB`;
		if (max) return `< ${max} GB`;
		return '-';
	}

	function formatEpisodeSize(profile: ScoringProfile): string {
		const min = profile.episodeMinSizeMb;
		const max = profile.episodeMaxSizeMb;
		if (min && max) return `${min} - ${max} MB`;
		if (min) return `${min}+ MB`;
		if (max) return `< ${max} MB`;
		return '-';
	}
</script>

{#if profiles.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Sliders class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No profiles configured</p>
		<p class="mt-1 text-sm">Add a profile to manage quality preferences</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Type</th>
					<th>
						<div class="flex items-center gap-1">
							<Film class="h-3.5 w-3.5" />
							Movie Size
						</div>
					</th>
					<th>
						<div class="flex items-center gap-1">
							<Tv class="h-3.5 w-3.5" />
							Episode Size
						</div>
					</th>
					<th>Default</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each profiles as profile (profile.id)}
					<tr class="hover">
						<td>
							<div class="flex items-center gap-3">
								{#if profile.isBuiltIn}
									<Lock class="h-4 w-4 text-base-content/40" />
								{:else}
									<Settings class="h-4 w-4 text-base-content/40" />
								{/if}
								<div>
									<div class="font-bold">{profile.name}</div>
									{#if profile.description}
										<div class="max-w-xs truncate text-sm opacity-50">
											{profile.description}
										</div>
									{/if}
								</div>
							</div>
						</td>
						<td>
							<span
								class="badge {profile.isBuiltIn ? 'badge-ghost' : 'badge-outline badge-primary'}"
							>
								{profile.isBuiltIn ? 'Built-in' : 'Custom'}
							</span>
						</td>
						<td>
							<span class="font-mono text-sm">{formatMovieSize(profile)}</span>
						</td>
						<td>
							<span class="font-mono text-sm">{formatEpisodeSize(profile)}</span>
						</td>
						<td>
							{#if profile.isDefault}
								<span class="badge gap-1 badge-success">
									<Check class="h-3 w-3" />
									Yes
								</span>
							{:else}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onSetDefault(profile)}
									title="Set as default"
								>
									<Star class="h-3.5 w-3.5" />
								</button>
							{/if}
						</td>
						<td>
							<div class="flex justify-end gap-1">
								<button class="btn btn-ghost btn-sm" onclick={() => onEdit(profile)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								{#if !profile.isBuiltIn}
									<button
										class="btn text-error btn-ghost btn-sm"
										onclick={() => onDelete(profile)}
										title="Delete"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
