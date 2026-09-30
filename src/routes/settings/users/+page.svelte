<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { ShieldCheck, User, UserPlus, ChevronRight } from 'lucide-svelte';
	import { authClient } from '$lib/auth/client.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { formatDisplayDate } from '$lib/utils/format.js';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import {
		isHardReservedUsername,
		USERNAME_MAX_LENGTH,
		USERNAME_MIN_LENGTH,
		USERNAME_PATTERN
	} from '$lib/auth/username-policy.js';

	let { data } = $props();

	function openDetail(userId: string) {
		void goto(resolvePath(`/settings/users/${userId}`));
	}

	// =====================
	// Create user modal
	// =====================
	let createOpen = $state(false);
	let creatingUser = $state(false);
	let newUsername = $state('');
	let newEmail = $state('');
	let newPassword = $state('');
	let newRole = $state<'user' | 'admin'>('user');
	let usernameError = $state('');

	function validateUsername(): boolean {
		usernameError = '';
		if (newUsername.length < USERNAME_MIN_LENGTH) {
			usernameError = m.setup_usernameMinLength({ min: String(USERNAME_MIN_LENGTH) });
			return false;
		}
		if (newUsername.length > USERNAME_MAX_LENGTH) {
			usernameError = m.setup_usernameMaxLength({ max: String(USERNAME_MAX_LENGTH) });
			return false;
		}
		if (!USERNAME_PATTERN.test(newUsername)) {
			usernameError = m.setup_usernameInvalidChars();
			return false;
		}
		if (isHardReservedUsername(newUsername)) {
			usernameError = m.setup_usernameReserved();
			return false;
		}
		return true;
	}

	function generatePassword(): void {
		const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		const bytes = new Uint32Array(20);
		crypto.getRandomValues(bytes);
		newPassword = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
	}

	function resetCreateForm(): void {
		newUsername = '';
		newEmail = '';
		newPassword = '';
		newRole = 'user';
		usernameError = '';
	}

	async function handleCreateUser() {
		if (!validateUsername()) return;
		if (!newEmail.includes('@')) {
			toasts.error(m.users_invalidEmail());
			return;
		}
		if (newPassword.length < 8) {
			toasts.error(m.users_passwordTooShort());
			return;
		}

		creatingUser = true;
		try {
			const result = await authClient.admin.createUser({
				email: newEmail,
				password: newPassword,
				name: newUsername,
				role: newRole,
				// The admin plugin carries additional user fields (like the
				// username plugin's) under `data`; a flat `username` is
				// silently stripped and the account is created without one.
				data: { username: newUsername }
			});
			if (result.error) {
				toasts.error(result.error.message || m.users_createFailed());
				return;
			}
			toasts.success(m.users_createSuccess({ username: newUsername }));
			createOpen = false;
			resetCreateForm();
			await invalidateAll();
		} finally {
			creatingUser = false;
		}
	}
</script>

<svelte:head>
	<title>{m.nav_users()} — Cinephage</title>
</svelte:head>

<SettingsPage title={m.nav_users()} subtitle={m.users_subtitle()}>
	<SettingsSection title={m.users_accountsTitle()} description={m.users_accountsDescription()}>
		{#snippet actions()}
			<button class="btn gap-1.5 btn-primary btn-sm" onclick={() => (createOpen = true)}>
				<UserPlus class="h-4 w-4" />
				{m.users_createButton()}
			</button>
		{/snippet}

		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>{m.users_columnUser()}</th>
						<th>{m.users_columnEmail()}</th>
						<th>{m.users_columnRole()}</th>
						<th>{m.users_columnStatus()}</th>
						<th class="hidden sm:table-cell">{m.users_columnCreated()}</th>
						<th class="hidden md:table-cell">{m.users_columnSessions()}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as userRow (userRow.id)}
						<tr
							class="cursor-pointer transition-colors hover:bg-base-200/60"
							onclick={() => openDetail(userRow.id)}
						>
							<td>
								<div class="flex items-center gap-3">
									<div
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
									>
										{(userRow.displayUsername || userRow.username || '?').charAt(0).toUpperCase()}
									</div>
									<div class="min-w-0">
										<div class="font-medium">{userRow.username ?? userRow.email}</div>
										{#if userRow.displayUsername && userRow.displayUsername !== userRow.username}
											<div class="text-xs text-base-content/50">{userRow.displayUsername}</div>
										{/if}
									</div>
								</div>
							</td>
							<td class="max-w-48 truncate text-sm text-base-content/70" title={userRow.email}>
								{userRow.email}
							</td>
							<td>
								{#if userRow.role === 'admin'}
									<span class="badge gap-1 badge-sm badge-primary">
										<ShieldCheck class="h-3 w-3" />
										{m.users_roleAdmin()}
									</span>
								{:else}
									<span class="badge gap-1 badge-ghost badge-sm">
										<User class="h-3 w-3" />
										{m.users_roleUser()}
									</span>
								{/if}
							</td>
							<td>
								{#if userRow.banned}
									<span
										class="badge badge-sm badge-error"
										title={userRow.banReason ?? m.users_defaultBanReason()}
									>
										{m.users_bannedStatus()}
									</span>
								{:else}
									<span class="badge badge-outline badge-sm badge-success">
										{m.users_activeStatus()}
									</span>
								{/if}
							</td>
							<td class="hidden text-sm text-base-content/70 sm:table-cell">
								{#if userRow.createdAt}
									{formatDisplayDate(userRow.createdAt)}
								{/if}
							</td>
							<td class="hidden md:table-cell">
								<span class="text-sm text-base-content/70">{userRow.sessionCount}</span>
							</td>
							<td>
								<ChevronRight class="h-4 w-4 text-base-content/40" />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</SettingsSection>
</SettingsPage>

<!-- Create user modal -->
<ModalWrapper open={createOpen} onClose={() => (createOpen = false)}>
	<ModalHeader title={m.users_createTitle()} onClose={() => (createOpen = false)} />
	<div class="space-y-4">
		<div>
			<label class="label" for="new-user-username">
				<span class="label-text">{m.users_formUsername()}</span>
			</label>
			<input
				id="new-user-username"
				type="text"
				class="input-bordered input w-full"
				bind:value={newUsername}
				maxlength={USERNAME_MAX_LENGTH}
			/>
			{#if usernameError}
				<p class="mt-1 text-xs text-error">{usernameError}</p>
			{/if}
		</div>
		<div>
			<label class="label" for="new-user-email">
				<span class="label-text">{m.users_formEmail()}</span>
			</label>
			<input
				id="new-user-email"
				type="email"
				class="input-bordered input w-full"
				bind:value={newEmail}
			/>
		</div>
		<div>
			<label class="label" for="new-user-password">
				<span class="label-text">{m.users_formPassword()}</span>
			</label>
			<div class="join w-full">
				<input
					id="new-user-password"
					type="text"
					class="input-bordered input join-item w-full font-mono text-sm"
					bind:value={newPassword}
				/>
				<button type="button" class="btn join-item" onclick={generatePassword}>
					{m.users_generatePassword()}
				</button>
			</div>
			<p class="mt-1 text-xs text-base-content/50">{m.users_passwordHint()}</p>
		</div>
		<div>
			<span class="label-text">{m.users_formRole()}</span>
			<div class="mt-1 flex gap-2">
				<label class="label cursor-pointer gap-2">
					<input
						type="radio"
						class="radio radio-sm radio-primary"
						bind:group={newRole}
						value="user"
					/>
					<span class="label-text">{m.users_roleUser()}</span>
				</label>
				<label class="label cursor-pointer gap-2">
					<input
						type="radio"
						class="radio radio-sm radio-primary"
						bind:group={newRole}
						value="admin"
					/>
					<span class="label-text">{m.users_roleAdmin()}</span>
				</label>
			</div>
			<p class="mt-1 text-xs text-base-content/50">{m.users_roleHint()}</p>
		</div>
	</div>
	<ModalFooter
		onCancel={() => (createOpen = false)}
		onSave={handleCreateUser}
		saving={creatingUser}
		saveLabel={m.users_createConfirm()}
	/>
</ModalWrapper>
