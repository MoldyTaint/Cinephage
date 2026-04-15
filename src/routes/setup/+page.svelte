<script lang="ts">
	import { goto } from '$app/navigation';
	import { Shield, User, Lock, CheckCircle, AlertCircle } from 'lucide-svelte';
	import { authClient } from '$lib/auth/client.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import {
		isHardReservedUsername,
		USERNAME_MAX_LENGTH,
		USERNAME_MIN_LENGTH,
		USERNAME_PATTERN
	} from '$lib/auth/username-policy.js';
	import * as m from '$lib/paraglide/messages.js';

	let currentStep = $state(1);
	let isLoading = $state(false);
	let error = $state('');

	// Form data
	let username = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');

	// Validation states
	let usernameError = $state('');
	let emailError = $state('');
	let passwordErrors = $state({
		length: false,
		uppercase: false,
		lowercase: false,
		number: false,
		special: false
	});
	let confirmError = $state('');

	function validateUsername(): boolean {
		usernameError = '';

		if (username.length < USERNAME_MIN_LENGTH) {
			usernameError = m.setup_usernameMinLength({ min: String(USERNAME_MIN_LENGTH) });
			return false;
		}
		if (username.length > USERNAME_MAX_LENGTH) {
			usernameError = m.setup_usernameMaxLength({ max: String(USERNAME_MAX_LENGTH) });
			return false;
		}
		if (!USERNAME_PATTERN.test(username)) {
			usernameError = m.setup_usernameInvalidChars();
			return false;
		}
		if (isHardReservedUsername(username)) {
			usernameError = m.setup_usernameReserved();
			return false;
		}

		return true;
	}

	function validateEmail(): boolean {
		if (!email || email.length === 0) {
			emailError = m.setup_emailRequired();
			return false;
		}
		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			emailError = m.setup_emailInvalid();
			return false;
		}
		emailError = '';
		return true;
	}

	function validatePassword(): boolean {
		const errors = {
			length: password.length >= 8,
			uppercase: /[A-Z]/.test(password),
			lowercase: /[a-z]/.test(password),
			number: /[0-9]/.test(password),
			special: /[^A-Za-z0-9\s]/.test(password)
		};
		passwordErrors = errors;

		// Calculate strength
		const passed = Object.values(errors).filter(Boolean).length;

		return passed === 5;
	}

	function validateConfirm(): boolean {
		if (password !== confirmPassword) {
			confirmError = m.setup_passwordsDoNotMatch();
			return false;
		}
		confirmError = '';
		return true;
	}

	async function handleSubmit() {
		error = '';

		if (!validateUsername() || !validateEmail() || !validatePassword() || !validateConfirm()) {
			return;
		}

		isLoading = true;

		try {
			// Better Auth username plugin uses signUp.email endpoint with username field
			const result = await authClient.signUp.email({
				email: email,
				password,
				name: username, // Display name
				username: username.toLowerCase() // Actual username field
			});

			if (result.error) {
				error = result.error.message || m.setup_failedToCreateAccount();
				return;
			}

			// Create API keys for the new user
			try {
				const apiKeyResponse = await fetch('/api/settings/system/api-keys', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include'
				});

				if (!apiKeyResponse.ok) {
					toasts.warning(m.setup_apiKeyWarning(), {
						description: await apiKeyResponse.text()
					});
				}
			} catch (apiKeyError) {
				// Don't fail setup if API key creation fails - keys can be regenerated later
				toasts.warning(m.setup_apiKeyFailed(), {
					description: apiKeyError instanceof Error ? apiKeyError.message : m.setup_apiKeyLater()
				});
			}

			// Mark setup as complete
			currentStep = 3;

			// Redirect to dashboard after 2 seconds
			setTimeout(() => {
				goto('/');
			}, 2000);
		} catch (e) {
			error = e instanceof Error ? e.message : m.login_unexpectedError();
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.setup_pageTitle()}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-lg bg-base-100 shadow-xl">
		<div class="card-body">
			{#if currentStep === 1}
				<!-- Step 1: Welcome -->
				<div class="space-y-4 text-center">
					<div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
						<Shield class="h-8 w-8 text-primary" />
					</div>
					<h1 class="text-3xl font-bold">{m.setup_welcomeTitle()}</h1>
					<p class="text-base-content/70">{m.setup_welcomeSubtitle()}</p>
					<div class="pt-4">
						<button
							class="btn btn-wide btn-primary"
							onclick={() => (currentStep = 2)}
							disabled={isLoading}
						>
							{m.setup_getStarted()}
						</button>
					</div>
				</div>
			{:else if currentStep === 2}
				<!-- Step 2: Create Admin Account -->
				<div class="space-y-6">
					<div class="text-center">
						<h2 class="text-2xl font-bold">{m.setup_createAdminTitle()}</h2>
						<p class="text-sm text-base-content/70">
							{m.setup_createAdminSubtitle()}
						</p>
					</div>

					{#if error}
						<div class="alert alert-error">
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
							<label class="label" for="setup-username">
								<span class="label-text flex items-center gap-2">
									<User class="h-4 w-4" />
									{m.setup_usernameLabel()}
								</span>
							</label>
							<input
								id="setup-username"
								type="text"
								class="input-bordered input w-full"
								class:input-error={usernameError}
								placeholder={m.setup_usernamePlaceholder()}
								bind:value={username}
								oninput={validateUsername}
								minlength={USERNAME_MIN_LENGTH}
								maxlength={USERNAME_MAX_LENGTH}
								aria-invalid={Boolean(usernameError)}
								aria-describedby="setup-username-help"
								required
							/>
							{#if usernameError}
								<div class="label">
									<span id="setup-username-help" class="label-text-alt text-error"
										>{usernameError}</span
									>
								</div>
							{:else}
								<div class="label">
									<span id="setup-username-help" class="label-text-alt"
										>{m.setup_usernameHelp()}</span
									>
								</div>
							{/if}
						</div>

						<!-- Email -->
						<div class="form-control">
							<label class="label" for="setup-email">
								<span class="label-text flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><rect width="20" height="16" x="2" y="4" rx="2" /><path
											d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
										/></svg
									>
									{m.setup_emailLabel()}
								</span>
							</label>
							<input
								id="setup-email"
								type="email"
								class="input-bordered input w-full"
								class:input-error={emailError}
								placeholder={m.setup_emailPlaceholder()}
								bind:value={email}
								oninput={validateEmail}
								aria-invalid={Boolean(emailError)}
								aria-describedby={emailError ? 'setup-email-help' : undefined}
								required
							/>
							{#if emailError}
								<div class="label">
									<span id="setup-email-help" class="label-text-alt text-error">{emailError}</span>
								</div>
							{/if}
						</div>

						<!-- Password -->
						<div class="form-control">
							<label class="label" for="setup-password">
								<span class="label-text flex items-center gap-2">
									<Lock class="h-4 w-4" />
									{m.setup_passwordLabel()}
								</span>
							</label>
							<input
								id="setup-password"
								type="password"
								class="input-bordered input w-full"
								placeholder="••••••••"
								bind:value={password}
								oninput={validatePassword}
								minlength="8"
								required
							/>

							<!-- Password requirements -->
							<div class="mt-2 space-y-1 text-xs">
								<div class={passwordErrors.length ? 'text-success' : 'text-base-content/50'}>
									{passwordErrors.length ? '✓' : '○'}
									{m.setup_passwordReqLength()}
								</div>
								<div class={passwordErrors.uppercase ? 'text-success' : 'text-base-content/50'}>
									{passwordErrors.uppercase ? '✓' : '○'}
									{m.setup_passwordReqUppercase()}
								</div>
								<div class={passwordErrors.lowercase ? 'text-success' : 'text-base-content/50'}>
									{passwordErrors.lowercase ? '✓' : '○'}
									{m.setup_passwordReqLowercase()}
								</div>
								<div class={passwordErrors.number ? 'text-success' : 'text-base-content/50'}>
									{passwordErrors.number ? '✓' : '○'}
									{m.setup_passwordReqNumber()}
								</div>
								<div class={passwordErrors.special ? 'text-success' : 'text-base-content/50'}>
									{passwordErrors.special ? '✓' : '○'}
									{m.setup_passwordReqSpecial()}
								</div>
							</div>
						</div>

						<!-- Confirm Password -->
						<div class="form-control">
							<label class="label" for="setup-confirm-password">
								<span class="label-text">{m.setup_confirmPasswordLabel()}</span>
							</label>
							<input
								id="setup-confirm-password"
								type="password"
								class="input-bordered input w-full"
								class:input-error={confirmError}
								placeholder="••••••••"
								bind:value={confirmPassword}
								oninput={validateConfirm}
								minlength="8"
								aria-invalid={Boolean(confirmError)}
								aria-describedby={confirmError ? 'setup-confirm-password-help' : undefined}
								required
							/>
							{#if confirmError}
								<div class="label">
									<span id="setup-confirm-password-help" class="label-text-alt text-error"
										>{confirmError}</span
									>
								</div>
							{/if}
						</div>

						<div class="flex gap-3 pt-2">
							<button
								type="button"
								class="btn flex-1 btn-ghost"
								onclick={() => (currentStep = 1)}
								disabled={isLoading}
							>
								{m.action_back()}
							</button>
							<button
								type="submit"
								class="btn flex-1 btn-primary"
								disabled={isLoading || !username || !email || !password || !confirmPassword}
							>
								{#if isLoading}
									<span class="loading loading-spinner"></span>
								{/if}
								{m.setup_createAccount()}
							</button>
						</div>
					</form>
				</div>
			{:else if currentStep === 3}
				<!-- Step 3: Success -->
				<div class="space-y-4 text-center">
					<div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
						<CheckCircle class="h-8 w-8 text-success" />
					</div>
					<h2 class="text-3xl font-bold">{m.setup_completeTitle()}</h2>
					<p class="text-base-content/70">{m.setup_completeMessage()}</p>
					<p class="text-sm text-base-content/50">{m.setup_redirecting()}</p>
					<div class="mt-4 h-2 w-full rounded-full bg-base-200">
						<div class="h-2 animate-pulse rounded-full bg-success" style="width: 100%"></div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
