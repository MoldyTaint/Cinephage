<script lang="ts">
	import { User, Lock, Bell, Shield } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';
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

	<!-- Placeholder Message -->
	<div class="card bg-base-200">
		<div class="card-body">
			<div class="mb-4 flex items-center gap-3 text-warning">
				<User class="h-8 w-8" />
				<h2 class="text-xl font-semibold">{m.profile_comingSoon()}</h2>
			</div>
			<p class="mb-4 text-base-content/80">
				{m.profile_comingSoonDescription()}
			</p>
			<ul class="ml-4 list-disc space-y-2 text-base-content/80">
				<li>{m.profile_featureAccountSettings()}</li>
				<li>{m.profile_featureNotifications()}</li>
				<li>{m.profile_featureAuth()}</li>
				<li>{m.profile_featureCustomize()}</li>
			</ul>
			<div class="divider"></div>
			<p class="text-sm text-base-content/60">
				{m.profile_singleAdminNote()}
			</p>
		</div>
	</div>

	<!-- Feature Preview Cards -->
	<div class="mt-8 grid gap-4 md:grid-cols-2">
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Lock class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">{m.profile_accountSecurity()}</h3>
				</div>
				<p class="text-sm text-base-content/70">
					{m.profile_accountSecurityDescription()}
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Bell class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">{m.profile_notifications()}</h3>
				</div>
				<p class="text-sm text-base-content/70">
					{m.profile_notificationsDescription()}
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<Shield class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">{m.profile_permissions()}</h3>
				</div>
				<p class="text-sm text-base-content/70">
					{m.profile_permissionsDescription()}
				</p>
			</div>
		</div>
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-2">
					<User class="h-5 w-5 text-base-content/50" />
					<h3 class="font-semibold">{m.profile_personalization()}</h3>
				</div>
				<p class="text-sm text-base-content/70">
					{m.profile_personalizationDescription()}
				</p>
			</div>
		</div>
	</div>
</div>
