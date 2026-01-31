<script lang="ts">
	import { User, Lock, Bell, Shield } from 'lucide-svelte';
</script>

<div class="mx-auto w-full max-w-2xl p-4">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold">User Profile</h1>
		<p class="text-base-content/70">Manage your account settings and preferences</p>
	</div>

	<!-- Placeholder Message -->
	<div class="card bg-base-200">
		<div class="card-body">
			<div class="mb-4 flex items-center gap-3 text-warning">
				<User class="h-8 w-8" />
				<h2 class="text-xl font-semibold">Coming Soon</h2>
			</div>
			<p class="mb-4 text-base-content/80">
				User accounts and profiles are planned for a future release. This page will allow you to:
			</p>
			<ul class="ml-4 list-disc space-y-2 text-base-content/80">
				<li>Manage your personal account settings</li>
				<li>Configure notification preferences</li>
				<li>Set up authentication and security options</li>
				<li>Customize your user experience</li>
			</ul>
			<div class="divider"></div>
			<p class="text-sm text-base-content/60">
				For now, Cinephage runs in single-admin mode. All settings are managed through the Settings
				menu.
			</p>
		</div>
	</div>

	<!-- Feature Preview Cards -->
	<div class="mt-8 grid gap-4 md:grid-cols-2">
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Lock class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">Account Security</h3>
				</div>
				<p class="text-sm text-base-content/70">
					Manage passwords, two-factor authentication, and login sessions.
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Bell class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">Notifications</h3>
				</div>
				<p class="text-sm text-base-content/70">
					Configure alerts for downloads, completed tasks, and system events.
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Shield class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">Permissions</h3>
				</div>
				<p class="text-sm text-base-content/70">
					Control access to features and manage user roles.
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<User class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">Personalization</h3>
				</div>
				<p class="text-sm text-base-content/70">
					Customize theme, language, and interface preferences.
				</p>
			</div>
		</div>
	</div>
</div>
