<script lang="ts">
	import { User, Lock, KeyRound, Check, Eye, EyeOff } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth/client.js';
	import { toasts } from '$lib/stores/toast.svelte';

	let { data } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let showPasswords = $state(false);
	let saving = $state(false);
	let saved = $state(false);

	const passwordsValid = $derived(currentPassword.length >= 8 && newPassword.length >= 8);
	const passwordsMatch = $derived(newPassword === confirmPassword);

	async function changePassword() {
		if (saving || !passwordsValid || !passwordsMatch) return;
		saving = true;
		saved = false;
		try {
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true
			});
			if (result.error) {
				toasts.error(result.error.message || m.login_invalidCredentials());
				return;
			}
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			saved = true;
			toasts.success(m.profile_passwordUpdated());
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : m.common_failedToSave());
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.profile_pageTitle()}</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl p-4">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold">{m.profile_title()}</h1>
		<p class="text-base-content/70">{m.profile_subtitle()}</p>
	</div>

	<!-- Account identity -->
	{#if data.user}
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<User class="h-5 w-5 text-base-content/50" />
					<h2 class="font-semibold">{m.profile_accountSecurity()}</h2>
				</div>
				<div class="flex items-center gap-4">
					<span
						class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary"
					>
						{(data.user.displayUsername || data.user.username || '?').charAt(0).toUpperCase()}
					</span>
					<div class="min-w-0">
						<p class="truncate text-lg font-medium">
							{data.user.displayUsername || data.user.username}
						</p>
						<p class="truncate text-sm text-base-content/60">@{data.user.username}</p>
					</div>
					<span class="ml-auto badge shrink-0 badge-ghost badge-sm">
						{data.user.role === 'admin' ? m.users_roleAdmin() : m.users_roleUser()}
					</span>
				</div>
				<div class="divider"></div>
				<p class="text-sm text-base-content/60">
					{#if data.user.role === 'admin'}
						{m.profile_adminNote()}
					{:else}
						{m.profile_viewerNote()}
					{/if}
				</p>
			</div>
		</div>
	{/if}

	<!-- Change password -->
	<div class="card mt-4 bg-base-200">
		<div class="card-body">
			<div class="mb-2 flex items-center gap-2">
				<Lock class="h-5 w-5 text-base-content/50" />
				<h2 class="font-semibold">{m.profile_changePassword()}</h2>
			</div>
			<p class="mb-4 text-sm text-base-content/70">{m.profile_changePasswordDescription()}</p>

			<form
				class="space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					changePassword();
				}}
			>
				<div class="form-control">
					<label class="label" for="current-password">
						<span class="label-text">{m.profile_currentPassword()}</span>
					</label>
					<div class="relative">
						<input
							id="current-password"
							type={showPasswords ? 'text' : 'password'}
							class="input-bordered input w-full pr-12"
							bind:value={currentPassword}
							required
							autocomplete="current-password"
						/>
						<button
							type="button"
							class="btn absolute top-1/2 right-2 -translate-y-1/2 btn-ghost btn-sm"
							aria-label={showPasswords ? 'Hide password' : 'Show password'}
							aria-pressed={showPasswords}
							onclick={() => (showPasswords = !showPasswords)}
						>
							{#if showPasswords}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="new-password">
						<span class="label-text">{m.profile_newPassword()}</span>
					</label>
					<input
						id="new-password"
						type={showPasswords ? 'text' : 'password'}
						class="input-bordered input w-full"
						bind:value={newPassword}
						required
						minlength="8"
						autocomplete="new-password"
					/>
				</div>

				<div class="form-control">
					<label class="label" for="confirm-password">
						<span class="label-text">{m.profile_confirmPassword()}</span>
					</label>
					<input
						id="confirm-password"
						type={showPasswords ? 'text' : 'password'}
						class="input-bordered input w-full"
						bind:value={confirmPassword}
						required
						minlength="8"
						autocomplete="new-password"
					/>
					{#if confirmPassword && !passwordsMatch}
						<p class="mt-1 text-xs text-error">{m.profile_passwordMismatch()}</p>
					{/if}
				</div>

				<button
					type="submit"
					class="btn btn-primary"
					disabled={saving || !passwordsValid || !passwordsMatch}
				>
					{#if saving}
						<span class="loading loading-spinner">&#8203;</span>
						{m.common_saving()}
					{:else if saved}
						<Check class="h-4 w-4" />
						{m.profile_passwordUpdated()}
					{:else}
						<KeyRound class="h-4 w-4" />
						{m.profile_changePassword()}
					{/if}
				</button>
			</form>
		</div>
	</div>
</div>
