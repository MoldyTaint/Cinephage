<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ShieldCheck,
		User,
		UserPlus,
		Ban,
		RotateCcw,
		KeyRound,
		Trash2,
		MoreVertical,
		Loader2
	} from 'lucide-svelte';
	import { authClient } from '$lib/auth/client.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { formatDisplayDate } from '$lib/utils/format.js';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import {
		ConfirmationModal,
		ModalWrapper,
		ModalHeader,
		ModalFooter
	} from '$lib/components/ui/modal';
	import {
		isHardReservedUsername,
		USERNAME_MAX_LENGTH,
		USERNAME_MIN_LENGTH,
		USERNAME_PATTERN
	} from '$lib/auth/username-policy.js';

	type ManagedUser = {
		id: string;
		username: string | null;
		displayUsername: string | null;
		email: string;
		role: string;
		banned: number | null;
		banReason: string | null;
		banExpires: string | null;
		createdAt: string | null;
		sessionCount: number;
	};

	let { data } = $props();

	const currentUserId = $derived(page.data.user?.id ?? '');

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
				username: newUsername
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

	// =====================
	// Row actions
	// =====================
	let actionInProgress = $state<string | null>(null);

	async function runAction(
		userId: string,
		action: () => Promise<{ error?: { message?: string } | null }>
	): Promise<boolean> {
		actionInProgress = userId;
		try {
			const result = await action();
			if (result.error) {
				toasts.error(result.error.message || m.users_actionFailed());
				return false;
			}
			await invalidateAll();
			return true;
		} finally {
			actionInProgress = null;
		}
	}

	async function handleSetRole(target: ManagedUser, role: 'user' | 'admin') {
		if (target.id === currentUserId && role === 'user') {
			// Self-demotion is refused server-side; don't even try.
			toasts.error(m.users_cannotDemoteSelf());
			return;
		}
		let ok = await runAction(target.id, () =>
			authClient.admin.setRole({ userId: target.id, role })
		);
		if (ok && role === 'user') {
			// The role change alone doesn't touch sessions; sign the demoted
			// admin out so no elevated session (even a cached cookie) survives.
			ok = await runAction(target.id, () =>
				authClient.admin.revokeUserSessions({ userId: target.id })
			);
		}
		if (ok) {
			toasts.success(
				role === 'admin'
					? m.users_promoted({ username: target.username ?? '' })
					: m.users_demoted({ username: target.username ?? '' })
			);
		}
	}

	async function handleBanToggle(target: ManagedUser) {
		if (target.banned) {
			const ok = await runAction(target.id, () =>
				authClient.admin.unbanUser({ userId: target.id })
			);
			if (ok) toasts.success(m.users_unbanned({ username: target.username ?? '' }));
		} else {
			const ok = await runAction(target.id, () =>
				authClient.admin.banUser({ userId: target.id, banReason: m.users_defaultBanReason() })
			);
			if (ok) toasts.success(m.users_banned({ username: target.username ?? '' }));
		}
	}

	async function handleRevokeSessions(target: ManagedUser) {
		const ok = await runAction(target.id, () =>
			authClient.admin.revokeUserSessions({ userId: target.id })
		);
		if (ok) toasts.success(m.users_sessionsRevoked({ username: target.username ?? '' }));
	}

	// =====================
	// Password reset modal
	// =====================
	let passwordTarget = $state<ManagedUser | null>(null);
	let resetPasswordValue = $state('');
	let resettingPassword = $state(false);

	function openPasswordReset(target: ManagedUser) {
		passwordTarget = target;
		resetPasswordValue = '';
		generatePassword();
	}

	async function handleSetPassword() {
		if (!passwordTarget) return;
		if (resetPasswordValue.length < 8) {
			toasts.error(m.users_passwordTooShort());
			return;
		}
		resettingPassword = true;
		try {
			const result = await authClient.admin.setUserPassword({
				userId: passwordTarget.id,
				newPassword: resetPasswordValue
			});
			if (result.error) {
				toasts.error(result.error.message || m.users_actionFailed());
				return;
			}
			// A password reset must invalidate existing sessions; the plugin
			// endpoint does not revoke them on its own.
			const revoke = await authClient.admin.revokeUserSessions({
				userId: passwordTarget.id
			});
			if (revoke.error) {
				toasts.error(m.users_passwordSetNoRevoke({ username: passwordTarget.username ?? '' }));
				return;
			}
			toasts.success(m.users_passwordSet({ username: passwordTarget.username ?? '' }));
			passwordTarget = null;
		} finally {
			resettingPassword = false;
		}
	}

	// =====================
	// Delete confirmation
	// =====================
	let deleteTarget = $state<ManagedUser | null>(null);
	let deletingUser = $state(false);

	async function handleDelete() {
		if (!deleteTarget) return;
		deletingUser = true;
		try {
			const result = await authClient.admin.removeUser({ userId: deleteTarget.id });
			if (result.error) {
				toasts.error(result.error.message || m.users_actionFailed());
				return;
			}
			toasts.success(m.users_deleted({ username: deleteTarget.username ?? '' }));
			deleteTarget = null;
			await invalidateAll();
		} finally {
			deletingUser = false;
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
						{@const isSelf = userRow.id === currentUserId}
						{@const isLastAdmin =
							userRow.role === 'admin' && data.users.filter((u) => u.role === 'admin').length === 1}
						<tr class={isSelf ? 'bg-base-200/50' : ''}>
							<td>
								<div class="flex items-center gap-3">
									<div
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
									>
										{(userRow.displayUsername || userRow.username || '?').charAt(0).toUpperCase()}
									</div>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="font-medium">{userRow.username ?? userRow.email}</span>
											{#if isSelf}
												<span class="badge badge-ghost badge-xs">{m.users_youBadge()}</span>
											{/if}
										</div>
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
								{#if isSelf}
									<span class="text-xs text-base-content/40">{m.users_selfHint()}</span>
								{:else}
									<div class="dropdown dropdown-end">
										<button tabindex="0" class="btn btn-ghost btn-xs" aria-label="User actions">
											{#if actionInProgress === userRow.id}
												<Loader2 class="h-4 w-4 animate-spin" />
											{:else}
												<MoreVertical class="h-4 w-4" />
											{/if}
										</button>
										<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
										<ul
											tabindex="0"
											class="menu dropdown-content z-50 w-56 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
										>
											{#if userRow.role === 'admin'}
												<li class="menu-title">
													<span class={isLastAdmin ? 'text-base-content/40' : ''}
														>{isLastAdmin ? m.users_lastAdminHint() : ''}</span
													>
												</li>
												<li class={isLastAdmin ? 'disabled' : ''}>
													<button
														disabled={isLastAdmin}
														onclick={() => handleSetRole(userRow, 'user')}
													>
														<User class="h-4 w-4" />
														{m.users_demoteAction()}
													</button>
												</li>
											{:else}
												<li>
													<button onclick={() => handleSetRole(userRow, 'admin')}>
														<ShieldCheck class="h-4 w-4" />
														{m.users_promoteAction()}
													</button>
												</li>
											{/if}
											<li>
												<button onclick={() => handleBanToggle(userRow)}>
													<Ban class="h-4 w-4" />
													{userRow.banned ? m.users_unbanAction() : m.users_banAction()}
												</button>
											</li>
											<li>
												<button onclick={() => openPasswordReset(userRow)}>
													<KeyRound class="h-4 w-4" />
													{m.users_setPasswordAction()}
												</button>
											</li>
											<li>
												<button onclick={() => handleRevokeSessions(userRow)}>
													<RotateCcw class="h-4 w-4" />
													{m.users_revokeSessionsAction()}
												</button>
											</li>
											<div class="divider my-1"></div>
											<li>
												<button class="text-error" onclick={() => (deleteTarget = userRow)}>
													<Trash2 class="h-4 w-4" />
													{m.users_deleteAction()}
												</button>
											</li>
										</ul>
									</div>
								{/if}
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
	<ModalFooter>
		<button class="btn btn-ghost" onclick={() => (createOpen = false)}>
			{m.action_cancel()}
		</button>
		<button class="btn btn-primary" onclick={handleCreateUser} disabled={creatingUser}>
			{#if creatingUser}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			{m.users_createConfirm()}
		</button>
	</ModalFooter>
</ModalWrapper>

<!-- Set password modal -->
<ModalWrapper open={passwordTarget !== null} onClose={() => (passwordTarget = null)}>
	<ModalHeader
		title={m.users_setPasswordTitle({ username: passwordTarget?.username ?? '' })}
		onClose={() => (passwordTarget = null)}
	/>
	<div class="space-y-4">
		<div>
			<label class="label" for="reset-password-value">
				<span class="label-text">{m.users_formPassword()}</span>
			</label>
			<div class="join w-full">
				<input
					id="reset-password-value"
					type="text"
					class="input-bordered input join-item w-full font-mono text-sm"
					bind:value={resetPasswordValue}
				/>
				<button type="button" class="btn join-item" onclick={generatePassword}>
					{m.users_generatePassword()}
				</button>
			</div>
			<p class="mt-1 text-xs text-base-content/50">{m.users_setPasswordHint()}</p>
		</div>
	</div>
	<ModalFooter>
		<button class="btn btn-ghost" onclick={() => (passwordTarget = null)}>
			{m.action_cancel()}
		</button>
		<button class="btn btn-primary" onclick={handleSetPassword} disabled={resettingPassword}>
			{#if resettingPassword}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			{m.users_setPasswordConfirm()}
		</button>
	</ModalFooter>
</ModalWrapper>

<!-- Delete confirmation -->
<ConfirmationModal
	open={deleteTarget !== null}
	onCancel={() => (deleteTarget = null)}
	onConfirm={handleDelete}
	loading={deletingUser}
	title={m.users_deleteTitle({ username: deleteTarget?.username ?? '' })}
	message={m.users_deleteMessage({ username: deleteTarget?.username ?? '' })}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
/>
