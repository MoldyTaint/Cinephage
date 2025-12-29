<script lang="ts">
	import {
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Server,
		FlaskConical,
		Loader2,
		CheckCircle2,
		XCircle
	} from 'lucide-svelte';
	import type { DownloadClientImplementation } from '$lib/types/downloadClient';

	// Unified client item that can be either a download client or NNTP server
	interface UnifiedClientItem {
		id: string;
		name: string;
		type: 'download-client' | 'nntp-server';
		implementation: DownloadClientImplementation;
		host: string;
		port: number;
		useSsl: boolean | null;
		enabled: boolean | null;
		// Download client fields
		movieCategory?: string;
		tvCategory?: string;
		// NNTP server fields
		maxConnections?: number | null;
		priority?: number | null;
		testResult?: string | null;
		lastTestedAt?: string | null;
	}

	interface Props {
		clients: UnifiedClientItem[];
		onEdit: (client: UnifiedClientItem) => void;
		onDelete: (client: UnifiedClientItem) => void;
		onToggle: (client: UnifiedClientItem) => void;
		onTest?: (client: UnifiedClientItem) => Promise<void>;
		testingId?: string | null;
	}

	let { clients, onEdit, onDelete, onToggle, onTest, testingId = null }: Props = $props();
</script>

{#if clients.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Server class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No download clients configured</p>
		<p class="mt-1 text-sm">Add a download client to start managing downloads</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Host</th>
					<th>Details</th>
					<th>Test</th>
					<th>Status</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each clients as client (client.id)}
					<tr class="hover">
						<td>
							<div class="flex items-center gap-3">
								<div class="placeholder avatar">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full {client.type ===
										'nntp-server'
											? 'bg-secondary text-secondary-content'
											: 'bg-neutral text-neutral-content'}"
									>
										{#if client.type === 'nntp-server'}
											<Server class="h-5 w-5" />
										{:else}
											<span class="text-xs uppercase">{client.implementation.slice(0, 2)}</span>
										{/if}
									</div>
								</div>
								<div>
									<div class="font-bold">{client.name}</div>
									<div class="text-sm capitalize opacity-50">
										{client.type === 'nntp-server' ? 'NNTP Server' : client.implementation}
									</div>
								</div>
							</div>
						</td>
						<td>
							<div class="font-mono text-sm">
								{#if client.type === 'nntp-server'}
									{client.useSsl ? 'nntps' : 'nntp'}://{client.host}:{client.port}
								{:else}
									{client.useSsl ? 'https' : 'http'}://{client.host}:{client.port}
								{/if}
							</div>
						</td>
						<td>
							{#if client.type === 'nntp-server'}
								<div class="flex flex-col gap-1">
									<span class="badge badge-ghost badge-sm"
										>Connections: {client.maxConnections ?? 10}</span
									>
									<span class="badge badge-outline badge-sm">Priority: {client.priority ?? 1}</span>
								</div>
							{:else}
								<div class="flex flex-col gap-1">
									<span class="badge badge-ghost badge-sm">Movies: {client.movieCategory}</span>
									<span class="badge badge-ghost badge-sm">TV: {client.tvCategory}</span>
								</div>
							{/if}
						</td>
						<td>
							{#if client.type === 'nntp-server'}
								{#if testingId === client.id}
									<span class="badge gap-1 badge-ghost badge-sm">
										<Loader2 class="h-3 w-3 animate-spin" />
										Testing
									</span>
								{:else if client.testResult === 'success'}
									<span class="badge gap-1 badge-sm badge-success">
										<CheckCircle2 class="h-3 w-3" />
										OK
									</span>
								{:else if client.testResult === 'failed'}
									<span class="badge gap-1 badge-sm badge-error">
										<XCircle class="h-3 w-3" />
										Failed
									</span>
								{:else}
									<span class="badge badge-ghost badge-sm">-</span>
								{/if}
							{:else}
								<span class="badge badge-ghost badge-sm">-</span>
							{/if}
						</td>
						<td>
							<span class="badge {client.enabled ? 'badge-success' : 'badge-ghost'}">
								{client.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</td>
						<td>
							<div class="flex justify-end gap-1">
								{#if client.type === 'nntp-server' && onTest}
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => onTest(client)}
										title="Test connection"
										disabled={testingId === client.id}
									>
										{#if testingId === client.id}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else}
											<FlaskConical class="h-4 w-4" />
										{/if}
									</button>
								{/if}
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onToggle(client)}
									title={client.enabled ? 'Disable' : 'Enable'}
								>
									{#if client.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button class="btn btn-ghost btn-sm" onclick={() => onEdit(client)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => onDelete(client)}
									title="Delete"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
