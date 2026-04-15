<script lang="ts">
	import { goto } from '$app/navigation';
	import { User, Lock, AlertCircle } from 'lucide-svelte';
	import { authClient } from '$lib/auth/client.js';
	import * as m from '$lib/paraglide/messages.js';

	let username = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	let isLoading = $state(false);
	let error = $state('');

	async function handleSubmit() {
		error = '';
		isLoading = true;

		try {
			const result = await authClient.signIn.username({
				username: username.toLowerCase(),
				password,
				rememberMe
			});

			if (result.error) {
				error = result.error.message || m.login_invalidCredentials();
				return;
			}

			// Redirect to dashboard on success
			goto('/');
		} catch (e) {
			error = e instanceof Error ? e.message : m.login_unexpectedError();
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.login_pageTitle()}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="mb-6 space-y-2 text-center">
				<h1 class="text-3xl font-bold">{m.login_welcomeBack()}</h1>
				<p class="text-base-content/70">{m.login_subtitle()}</p>
			</div>

			{#if error}
				<div class="mb-4 alert alert-error">
					<AlertCircle class="h-5 w-5" />
					<span>{error}</span>
				</div>
			{/if}

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-4"
			>
				<!-- Username -->
				<div class="form-control">
					<label class="label">
						<span class="label-text flex items-center gap-2">
							<User class="h-4 w-4" />
							{m.login_usernameLabel()}
						</span>
					</label>
					<input
						type="text"
						class="input-bordered input w-full"
						placeholder={m.login_usernamePlaceholder()}
						bind:value={username}
						required
						autocomplete="username"
					/>
				</div>

				<!-- Password -->
				<div class="form-control">
					<label class="label">
						<span class="label-text flex items-center gap-2">
							<Lock class="h-4 w-4" />
							{m.login_passwordLabel()}
						</span>
					</label>
					<input
						type="password"
						class="input-bordered input w-full"
						placeholder="••••••••"
						bind:value={password}
						required
						autocomplete="current-password"
					/>
				</div>

				<!-- Remember Me -->
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-2">
						<input type="checkbox" class="checkbox" bind:checked={rememberMe} />
						<span class="label-text">{m.login_rememberMe()}</span>
					</label>
				</div>

				<button
					type="submit"
					class="btn w-full btn-primary"
					disabled={isLoading || !username || !password}
				>
					{#if isLoading}
						<span class="loading loading-spinner">&#8203;</span>
						{m.action_signingIn()}
					{:else}
						{m.action_signIn()}
					{/if}
				</button>
			</form>
		</div>
	</div>
</div>
