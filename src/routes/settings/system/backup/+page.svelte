<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Download, Upload, RefreshCw, AlertCircle, CheckCircle } from 'lucide-svelte';
	import type { LayoutData } from '../$types';
	import { invalidateAll } from '$app/navigation';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	let { data: _data }: { data: LayoutData } = $props();

	// =====================
	// Backup & Restore State
	// =====================
	type BackupSectionId =
		| 'system'
		| 'profiles'
		| 'downloads'
		| 'indexers'
		| 'subtitles'
		| 'integrations'
		| 'liveTv';

	interface BackupSectionPreview {
		id: BackupSectionId;
		tableNames: string[];
		totalRows: number;
		summary: string;
	}

	interface BackupPreview {
		version: number;
		createdAt: string;
		totalSections: number;
		includeIndexerCookies: boolean;
		supportsRestoreModes: string[];
		sections: BackupSectionPreview[];
	}

	const BACKUP_SECTION_GROUPS: BackupSectionPreview[] = [
		{
			id: 'system',
			tableNames: [
				'settings',
				'monitoringSettings',
				'captchaSolverSettings',
				'taskSettings',
				'rootFolders',
				'libraries',
				'libraryRootFolders',
				'librarySettings',
				'namingSettings',
				'namingPresets'
			],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'profiles',
			tableNames: [
				'scoringProfiles',
				'profileSizeLimits',
				'builtInProfileScoreOverrides',
				'customFormats',
				'delayProfiles',
				'languageProfiles'
			],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'downloads',
			tableNames: ['downloadClients', 'nntpServers'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'indexers',
			tableNames: ['indexers'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'subtitles',
			tableNames: ['subtitleProviders', 'subtitleSettings'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'integrations',
			tableNames: ['mediaBrowserServers', 'smartLists'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'liveTv',
			tableNames: [
				'stalkerPortals',
				'livetvAccounts',
				'channelCategories',
				'channelLineupItems',
				'channelLineupBackups'
			],
			totalRows: 0,
			summary: ''
		}
	];

	function getSectionLabel(sectionId: BackupSectionId): string {
		switch (sectionId) {
			case 'system':
				return m.settings_system_backup_sectionSystem();
			case 'profiles':
				return m.settings_system_backup_sectionProfiles();
			case 'downloads':
				return m.settings_system_backup_sectionDownloads();
			case 'indexers':
				return m.settings_system_backup_sectionIndexers();
			case 'subtitles':
				return m.settings_system_backup_sectionSubtitles();
			case 'integrations':
				return m.settings_system_backup_sectionIntegrations();
			case 'liveTv':
				return m.settings_system_backup_sectionLiveTv();
		}
	}

	function summarizeBackupSection(
		sectionId: BackupSectionId,
		totalRows: number,
		_countsByTable: Record<string, number>
	): string {
		switch (sectionId) {
			case 'system':
				return m.settings_system_backup_summarySystem({ count: String(totalRows) });
			case 'profiles':
				return m.settings_system_backup_summaryProfiles({ count: String(totalRows) });
			case 'downloads':
				return m.settings_system_backup_summaryDownloads({ count: String(totalRows) });
			case 'indexers':
				return m.settings_system_backup_summaryIndexers({ count: String(totalRows) });
			case 'subtitles':
				return m.settings_system_backup_summarySubtitles({ count: String(totalRows) });
			case 'integrations':
				return m.settings_system_backup_summaryIntegrations({ count: String(totalRows) });
			case 'liveTv':
				return m.settings_system_backup_summaryLiveTv({ count: String(totalRows) });
		}
	}

	let backupExportPassphrase = $state('');
	let backupIncludeIndexerCookies = $state(false);
	let backupImportPassphrase = $state('');
	let backupExporting = $state(false);
	let backupImporting = $state(false);
	let confirmRestoreOpen = $state(false);
	let selectedBackupFile = $state<File | null>(null);
	let backupPreview = $state<BackupPreview | null>(null);
	let backupMessage = $state<string | null>(null);
	let backupError = $state<string | null>(null);
	let backupWarnings = $state<string[]>([]);
	let selectedRestoreSections = $state<BackupSectionId[]>([]);

	function buildBackupPreview(backup: unknown): BackupPreview {
		if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
			throw new Error(m.settings_system_backup_errorInvalidFile());
		}

		const candidate = backup as Record<string, unknown>;
		const data = candidate.data;
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error(m.settings_system_backup_errorMissingData());
		}

		const manifest = candidate.manifest;
		if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
			const typedManifest = manifest as Record<string, unknown>;
			const sections = Array.isArray(typedManifest.sections)
				? typedManifest.sections
						.filter(
							(section): section is Record<string, unknown> =>
								!!section && typeof section === 'object'
						)
						.map((section) => {
							const tableNames = Array.isArray(section.tableNames)
								? section.tableNames.map((name) => String(name))
								: [];
							const sectionId = String(section.id) as BackupSectionId;
							const countsByTable = Object.fromEntries(
								tableNames.map((tableName) => [
									tableName,
									Array.isArray((data as Record<string, unknown>)[tableName])
										? ((data as Record<string, unknown>)[tableName] as unknown[]).length
										: 0
								])
							);

							return {
								id: sectionId,
								tableNames,
								totalRows: typeof section.totalRows === 'number' ? section.totalRows : 0,
								summary: summarizeBackupSection(
									sectionId,
									typeof section.totalRows === 'number' ? section.totalRows : 0,
									countsByTable
								)
							};
						})
				: [];

			return {
				version: typeof candidate.version === 'number' ? candidate.version : 1,
				createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
				totalSections: sections.filter((section) => section.totalRows > 0).length,
				includeIndexerCookies:
					!!candidate.options &&
					typeof candidate.options === 'object' &&
					!Array.isArray(candidate.options) &&
					!!(candidate.options as Record<string, unknown>).includeIndexerCookies,
				supportsRestoreModes: Array.isArray(typedManifest.supportsRestoreModes)
					? typedManifest.supportsRestoreModes.map((mode) => String(mode))
					: ['apply'],
				sections
			};
		}

		const dataRecord = data as Record<string, unknown>;
		const sections = BACKUP_SECTION_GROUPS.map((section) => {
			const countsByTable = Object.fromEntries(
				section.tableNames.map((tableName) => [
					tableName,
					Array.isArray(dataRecord[tableName]) ? (dataRecord[tableName] as unknown[]).length : 0
				])
			);
			const totalRows = Object.values(countsByTable).reduce<number>((sum, count) => sum + count, 0);

			return {
				...section,
				totalRows,
				summary: summarizeBackupSection(section.id, totalRows, countsByTable)
			};
		});

		return {
			version: typeof candidate.version === 'number' ? candidate.version : 1,
			createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
			totalSections: sections.filter((section) => section.totalRows > 0).length,
			includeIndexerCookies: false,
			supportsRestoreModes: ['apply'],
			sections
		};
	}

	async function handleBackupFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectedBackupFile = input.files?.[0] ?? null;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];
		backupPreview = null;

		if (!selectedBackupFile) {
			selectedRestoreSections = [];
			return;
		}

		try {
			const backup = JSON.parse(await selectedBackupFile.text());
			backupPreview = buildBackupPreview(backup);
			selectedRestoreSections = backupPreview.sections
				.filter((section) => section.totalRows > 0)
				.map((section) => section.id);
		} catch (error) {
			selectedBackupFile = null;
			selectedRestoreSections = [];
			backupError =
				error instanceof Error ? error.message : m.settings_system_backup_errorReadFile();
		}
	}

	function toggleRestoreSection(sectionId: BackupSectionId, checked: boolean) {
		if (checked) {
			if (!selectedRestoreSections.includes(sectionId)) {
				selectedRestoreSections = [...selectedRestoreSections, sectionId];
			}
			return;
		}

		selectedRestoreSections = selectedRestoreSections.filter((section) => section !== sectionId);
	}

	async function exportConfigurationBackup() {
		backupExporting = true;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];

		try {
			const response = await fetch('/api/settings/system/backup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passphrase: backupExportPassphrase,
					includeIndexerCookies: backupIncludeIndexerCookies
				})
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(
					getResponseErrorMessage(payload, m.settings_system_backup_errorExportFailed())
				);
			}

			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
				throw new Error(m.settings_system_backup_errorInvalidExportResponse());
			}

			const backup = payload.backup;
			const fileName =
				typeof payload.fileName === 'string'
					? payload.fileName
					: m.settings_system_backup_defaultFileName();
			const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = fileName;
			anchor.click();
			URL.revokeObjectURL(url);

			backupMessage = m.settings_system_backup_exportSuccess();
		} catch (error) {
			backupError =
				error instanceof Error ? error.message : m.settings_system_backup_errorExportFailed();
		} finally {
			backupExporting = false;
		}
	}

	async function importConfigurationBackup() {
		if (!selectedBackupFile) {
			backupError = m.settings_system_backup_errorSelectFileFirst();
			return;
		}

		if (selectedRestoreSections.length === 0) {
			backupError = m.settings_system_backup_errorSelectSectionFirst();
			return;
		}

		if (!backupImportPassphrase.trim()) {
			backupError = m.settings_system_backup_errorPassphraseRequired();
			return;
		}

		confirmRestoreOpen = false;
		backupImporting = true;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];

		try {
			const backup = JSON.parse(await selectedBackupFile.text());
			const response = await fetch('/api/settings/system/backup', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passphrase: backupImportPassphrase.trim(),
					sections: selectedRestoreSections,
					mode: 'apply',
					backup
				})
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(
					getResponseErrorMessage(payload, m.settings_system_backup_errorRestoreFailed())
				);
			}

			const result =
				payload && typeof payload === 'object' && !Array.isArray(payload)
					? payload.result
					: undefined;
			const resultRecord =
				result && typeof result === 'object' && !Array.isArray(result)
					? (result as Record<string, unknown>)
					: null;
			const warningCandidates = resultRecord?.warnings;
			backupWarnings = Array.isArray(warningCandidates)
				? warningCandidates.filter(
						(warning: unknown): warning is string => typeof warning === 'string'
					)
				: [];
			backupMessage =
				backupWarnings.length > 0
					? m.settings_system_backup_restoreSuccessWithWarnings()
					: m.settings_system_backup_restoreSuccess();
			selectedBackupFile = null;
			backupPreview = null;
			selectedRestoreSections = [];
			await invalidateAll();
		} catch (error) {
			backupError =
				error instanceof Error ? error.message : m.settings_system_backup_errorRestoreFailed();
		} finally {
			backupImporting = false;
		}
	}

	function promptRestoreConfiguration() {
		if (!selectedBackupFile) {
			backupError = m.settings_system_backup_errorSelectFileFirst();
			return;
		}

		if (selectedRestoreSections.length === 0) {
			backupError = m.settings_system_backup_errorSelectSectionFirst();
			return;
		}

		if (!backupImportPassphrase.trim()) {
			backupError = m.settings_system_backup_errorPassphraseRequired();
			return;
		}

		backupError = null;
		confirmRestoreOpen = true;
	}
</script>

<svelte:head>
	<title>{m.settings_system_backup_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.nav_backupRestore()} subtitle={m.settings_system_backup_subtitle()}>
	<SettingsSection title="">
		<div class="alert overflow-hidden alert-info">
			<AlertCircle class="h-5 w-5" />
			<div class="min-w-0">
				<p class="font-medium">{m.settings_system_backup_noticeTitle()}</p>
				<p class="text-sm wrap-break-word">
					{m.settings_system_backup_noticeDescription()}
				</p>
			</div>
		</div>

		{#if backupError}
			<div class="alert alert-error">
				<AlertCircle class="h-4 w-4" />
				<span>{backupError}</span>
			</div>
		{/if}

		{#if backupWarnings.length > 0}
			<div class="alert alert-warning">
				<AlertCircle class="h-4 w-4" />
				<div class="space-y-1">
					<div class="font-medium">{m.settings_system_backup_restoreWarningsTitle()}</div>
					<ul class="list-inside list-disc text-sm">
						{#each backupWarnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}

		{#if backupMessage}
			<div class="alert alert-success">
				<CheckCircle class="h-4 w-4" />
				<span>{backupMessage}</span>
			</div>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<!-- Export -->
			<div class="min-w-0 overflow-hidden rounded-lg bg-base-100 p-4">
				<div class="mb-3 flex items-center gap-2">
					<Download class="h-5 w-5" />
					<h3 class="text-base font-semibold">{m.settings_system_backup_exportTitle()}</h3>
				</div>

				<p class="mb-4 text-sm wrap-break-word text-base-content/70">
					{m.settings_system_backup_exportDescription()}
				</p>

				<label
					class="label flex-wrap items-start gap-2 whitespace-normal"
					for="backup-export-passphrase"
				>
					<span class="label-text">{m.settings_system_backup_exportPassphraseLabel()}</span>
				</label>
				<input
					id="backup-export-passphrase"
					type="password"
					class="input-bordered input w-full"
					placeholder={m.settings_system_backup_exportPassphrasePlaceholder()}
					bind:value={backupExportPassphrase}
				/>

				<label class="label mt-4 cursor-pointer justify-start gap-3 whitespace-normal">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						bind:checked={backupIncludeIndexerCookies}
					/>
					<div class="min-w-0">
						<span class="label-text font-medium"
							>{m.settings_system_backup_includeCookiesLabel()}</span
						>
						<p class="text-sm wrap-break-word text-base-content/70">
							{m.settings_system_backup_includeCookiesHelp()}
						</p>
					</div>
				</label>

				<div class="mt-4 flex justify-end">
					<button
						class="btn w-full gap-2 btn-primary sm:w-auto"
						onclick={exportConfigurationBackup}
						disabled={backupExporting || backupExportPassphrase.trim().length < 16}
					>
						{#if backupExporting}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.settings_system_backup_exporting()}
						{:else}
							<Download class="h-4 w-4" />
							{m.settings_system_backup_exportButton()}
						{/if}
					</button>
				</div>
			</div>

			<!-- Restore -->
			<div class="min-w-0 overflow-hidden rounded-lg bg-base-100 p-4">
				<div class="mb-3 flex items-center gap-2">
					<Upload class="h-5 w-5" />
					<h3 class="text-base font-semibold">{m.settings_system_backup_restoreTitle()}</h3>
				</div>

				<p class="mb-4 text-sm wrap-break-word text-base-content/70">
					{m.settings_system_backup_restoreDescription()}
				</p>

				<label
					class="label flex-wrap items-start gap-2 whitespace-normal"
					for="backup-restore-file"
				>
					<span class="label-text">{m.settings_system_backup_fileLabel()}</span>
				</label>
				<input
					id="backup-restore-file"
					type="file"
					class="file-input-bordered file-input w-full max-w-full min-w-0"
					accept="application/json,.json"
					onchange={handleBackupFileChange}
				/>

				{#if backupPreview}
					<div class="mt-4 min-w-0 overflow-hidden rounded-lg border border-base-300 p-4">
						<div
							class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
						>
							<div class="min-w-0">
								<div class="font-medium">{m.settings_system_backup_previewTitle()}</div>
								<div class="text-sm wrap-break-word text-base-content/70">
									{m.settings_system_backup_version({ version: String(backupPreview.version) })}
									{#if backupPreview.createdAt}
										• {new Date(backupPreview.createdAt).toLocaleString()}
									{/if}
								</div>
							</div>
							<div class="text-right text-sm text-base-content/70">
								<div>
									{m.settings_system_backup_sectionCount({
										count: String(backupPreview.totalSections)
									})}
								</div>
							</div>
						</div>

						<div class="space-y-2">
							<div class="text-sm font-medium">
								{m.settings_system_backup_restoreSectionsTitle()}
							</div>
							{#each backupPreview.sections.filter((section) => section.totalRows > 0) as section (section.id)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3"
								>
									<input
										type="checkbox"
										class="checkbox mt-0.5 checkbox-sm"
										checked={selectedRestoreSections.includes(section.id)}
										onchange={(event) =>
											toggleRestoreSection(
												section.id,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
									<div class="min-w-0">
										<div class="font-medium">{getSectionLabel(section.id)}</div>
										<div class="text-sm text-base-content/70">
											{section.summary}
										</div>
									</div>
								</label>
							{/each}
						</div>

						{#if backupPreview.includeIndexerCookies}
							<div class="mt-4 alert overflow-hidden alert-warning">
								<AlertCircle class="h-4 w-4" />
								<span class="wrap-break-word">
									{m.settings_system_backup_cookieWarning()}
								</span>
							</div>
						{/if}
					</div>
				{/if}

				<label
					class="label mt-3 flex-wrap items-start gap-2 whitespace-normal"
					for="backup-import-passphrase"
				>
					<span class="label-text">{m.settings_system_backup_restorePassphraseLabel()}</span>
				</label>
				<input
					id="backup-import-passphrase"
					type="password"
					class="input-bordered input w-full"
					placeholder={m.settings_system_backup_restorePassphrasePlaceholder()}
					bind:value={backupImportPassphrase}
				/>

				<div class="mt-4 flex justify-end">
					<button
						class="btn w-full gap-2 btn-warning sm:w-auto"
						onclick={promptRestoreConfiguration}
						disabled={backupImporting ||
							!selectedBackupFile ||
							selectedRestoreSections.length === 0 ||
							!backupImportPassphrase.trim()}
					>
						{#if backupImporting}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.settings_system_backup_restoring()}
						{:else}
							<Upload class="h-4 w-4" />
							{m.settings_system_backup_restoreButton()}
						{/if}
					</button>
				</div>
			</div>
		</div>
	</SettingsSection>
</SettingsPage>

<ConfirmationModal
	open={confirmRestoreOpen}
	title={m.settings_system_backup_confirmTitle()}
	message={m.settings_system_backup_confirmMessage({
		count: String(selectedRestoreSections.length)
	})}
	confirmLabel={m.settings_system_backup_restoreButton()}
	confirmVariant="warning"
	loading={backupImporting}
	onConfirm={importConfigurationBackup}
	onCancel={() => (confirmRestoreOpen = false)}
/>
