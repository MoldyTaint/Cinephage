<script lang="ts">
	import type { PageData } from './$types';
	import type { ArchiverPublic } from '$lib/server/archivers/types.js';
	import type { ArchiverCreate } from '$lib/validation/schemas.js';
	import { invalidateAll } from '$app/navigation';
	import { Archive, CheckCircle2, Pencil, Plus, Server, Trash2, XCircle } from 'lucide-svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { ModalFooter, ModalHeader, ModalWrapper } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import {
		createArchiver,
		deleteArchiver,
		testArchiver,
		testArchiverConfig,
		updateArchiver
	} from '$lib/api/archivers.js';

	let { data }: { data: PageData } = $props();
	let modalOpen = $state(false);
	let editing = $state<ArchiverPublic | null>(null);
	let saving = $state(false);
	let testing = $state(false);
	let error = $state<string | null>(null);
	let name = $state('');
	let endpoint = $state('http://rclone:5572');
	let username = $state('');
	let password = $state('');
	let remote = $state('');
	let basePath = $state('');
	let mountedRootFolderId = $state('');
	let timeoutSeconds = $state(3600);
	let enabled = $state(true);

	function openModal(archiver: ArchiverPublic | null = null) {
		editing = archiver;
		name = archiver?.name ?? '';
		endpoint = archiver?.endpoint ?? 'http://rclone:5572';
		username = archiver?.username ?? '';
		password = '';
		remote = archiver?.remote ?? '';
		basePath = archiver?.basePath ?? '';
		mountedRootFolderId = archiver?.mountedRootFolderId ?? '';
		timeoutSeconds = archiver?.timeoutSeconds ?? 3600;
		enabled = archiver?.enabled ?? true;
		error = null;
		modalOpen = true;
	}

	function payload(): ArchiverCreate {
		return {
			name,
			type: 'rclone',
			endpoint,
			username: username || null,
			password: password || undefined,
			remote,
			basePath,
			mountedRootFolderId: mountedRootFolderId || null,
			timeoutSeconds,
			enabled
		};
	}

	async function handleTest() {
		testing = true;
		error = null;
		try {
			const result = editing
				? password
					? await testArchiverConfig(payload())
					: await testArchiver(editing.id)
				: await testArchiverConfig(payload());
			if (!result.success) throw new Error(result.error || 'Connection test failed');
			toasts.success('rclone connection successful');
			await invalidateAll();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Connection test failed';
		} finally {
			testing = false;
		}
	}

	async function handleSave() {
		saving = true;
		error = null;
		try {
			if (editing) await updateArchiver(editing.id, payload());
			else await createArchiver(payload());
			await invalidateAll();
			modalOpen = false;
			toasts.success('Archiver saved');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Failed to save archiver';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(archiver: ArchiverPublic) {
		if (!confirm(`Delete archiver “${archiver.name}”?`)) return;
		try {
			await deleteArchiver(archiver.id);
			await invalidateAll();
			toasts.success('Archiver deleted');
		} catch (cause) {
			toasts.error(cause instanceof Error ? cause.message : 'Failed to delete archiver');
		}
	}
</script>

<svelte:head><title>Archivers</title></svelte:head>

<SettingsPage
	title="Archivers"
	subtitle="Archive local media to long-term storage through an rclone Remote Control API."
>
	{#snippet actions()}
		<button class="btn gap-2 btn-primary btn-sm" onclick={() => openModal()}>
			<Plus size={16} /> Add archiver
		</button>
	{/snippet}

	<div class="mb-4 alert border border-warning/20 bg-warning/10 text-sm">
		<Server size={18} />
		<span>
			rclone RC grants powerful access. Keep the endpoint on a trusted network and enable Basic
			authentication when it is reachable by other hosts.
		</span>
	</div>

	{#if data.archivers.length === 0}
		<div class="rounded-xl border border-dashed border-base-content/20 p-10 text-center">
			<Archive class="mx-auto mb-3 opacity-40" size={36} />
			<p class="font-medium">No archivers configured</p>
			<p class="mt-1 text-sm text-base-content/60">
				Add an rclone RC target to enable Archive actions.
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
			<table class="table">
				<thead
					><tr
						><th>Status</th><th>Name</th><th>Target</th><th>Mounted root</th><th>Endpoint</th><th
						></th></tr
					></thead
				>
				<tbody>
					{#each data.archivers as archiver (archiver.id)}
						<tr>
							<td>
								{#if !archiver.enabled}<span class="badge">Disabled</span>
								{:else if archiver.testResult === 'failed'}<span class="badge badge-error"
										><XCircle size={12} /> Failed</span
									>
								{:else}<span class="badge badge-success"><CheckCircle2 size={12} /> Enabled</span
									>{/if}
							</td>
							<td class="font-medium"
								>{archiver.name}
								<div class="text-xs font-normal text-base-content/50">Rclone</div></td
							>
							<td><code>{archiver.remote}:{archiver.basePath}</code></td>
							<td>
								{#if archiver.mountedRootFolderPath}
									<div class="font-medium">{archiver.mountedRootFolderName}</div>
									<code class="text-xs">{archiver.mountedRootFolderPath}</code>
								{:else}<span class="text-base-content/40">Not configured</span>{/if}
							</td>
							<td class="max-w-xs truncate">{archiver.endpoint}</td>
							<td
								><div class="flex justify-end gap-1">
									<button
										class="btn btn-ghost btn-sm"
										aria-label="Edit"
										onclick={() => openModal(archiver)}><Pencil size={15} /></button
									>
									<button
										class="btn btn-ghost text-error btn-sm"
										aria-label="Delete"
										onclick={() => handleDelete(archiver)}><Trash2 size={15} /></button
									>
								</div></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</SettingsPage>

<ModalWrapper open={modalOpen} maxWidth="lg" onClose={() => (modalOpen = false)}>
	<ModalHeader
		title={editing ? 'Edit archiver' : 'Add archiver'}
		onClose={() => (modalOpen = false)}
	/>
	<div class="space-y-4 p-6">
		{#if error}<div class="alert text-sm alert-error">{error}</div>{/if}
		<label class="form-control"
			><span class="label-text mb-1">Name</span><input
				class="input-bordered input"
				bind:value={name}
				required
			/></label
		>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="form-control"
				><span class="label-text mb-1">Type</span><select class="select-bordered select" disabled
					><option>Rclone</option></select
				></label
			>
			<label class="form-control"
				><span class="label-text mb-1">RC endpoint</span><input
					class="input-bordered input"
					type="url"
					bind:value={endpoint}
					placeholder="http://rclone:5572"
					required
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Username (optional)</span><input
					class="input-bordered input"
					bind:value={username}
					autocomplete="username"
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1"
					>Password {editing ? '(leave blank to keep)' : '(optional)'}</span
				><input
					class="input-bordered input"
					type="password"
					bind:value={password}
					autocomplete="current-password"
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Rclone remote</span><input
					class="input-bordered input"
					bind:value={remote}
					placeholder="jottacloud-crypt:"
					required
				/><span class="mt-1 text-xs text-base-content/50"
					>Use an existing remote from the rclone configuration.</span
				></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Base directory (optional)</span><input
					class="input-bordered input"
					bind:value={basePath}
					placeholder="Media/Archive"
				/></label
			>
			<label class="form-control sm:col-span-2"
				><span class="label-text mb-1">Mounted Cinephage root folder (optional)</span><select
					class="select-bordered select"
					bind:value={mountedRootFolderId}
					><option value="">Do not update library paths</option
					>{#each data.rootFolders as folder (folder.id)}<option value={folder.id}
							>{folder.name} ({folder.mediaType === 'movie' ? 'Movies' : 'TV'}) — {folder.path}</option
						>{/each}</select
				><span class="mt-1 text-xs text-base-content/50"
					>Select the root folder whose path mounts this exact rclone target and base directory.
					Cinephage can then point archived media at the mounted copy.</span
				></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Upload timeout (seconds)</span><input
					class="input-bordered input"
					type="number"
					min="30"
					max="86400"
					bind:value={timeoutSeconds}
				/></label
			>
			<label class="label mt-6 cursor-pointer justify-start gap-3"
				><input class="toggle toggle-primary" type="checkbox" bind:checked={enabled} /><span
					class="label-text">Enabled</span
				></label
			>
		</div>
	</div>
	<div class="mt-6 flex justify-start border-t border-base-300 pt-4">
		<button class="btn btn-ghost" onclick={handleTest} disabled={testing || saving}
			>{testing ? 'Testing…' : 'Test connection'}</button
		>
	</div>
	<ModalFooter
		onCancel={() => (modalOpen = false)}
		onSave={handleSave}
		{saving}
		saveDisabled={testing || !name || !endpoint || !remote}
		saveLabel="Save"
	/>
</ModalWrapper>
