/**
 * GitHub Labels Sync Script
 *
 * Synchronizes GitHub labels to match the defined schema.
 * Run with: npx tsx scripts/sync-labels.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --delete     Delete labels not in schema (default: false)
 */

import { execFileSync } from 'child_process';

interface Label {
	name: string;
	color: string;
	description: string;
}

// Label schema - single source of truth
const LABELS: Label[] = [
	// Type Labels (Blue family)
	{ name: 'Type: Bug', color: 'd73a4a', description: 'Something is broken' },
	{ name: 'Type: Feature', color: '0052cc', description: 'New functionality' },
	{ name: 'Type: Enhancement', color: '1d76db', description: 'Improvement to existing feature' },
	{
		name: 'Type: Refactor',
		color: '5319e7',
		description: 'Code restructuring, no behavior change'
	},
	{ name: 'Type: Docs', color: '0075ca', description: 'Documentation only' },
	{ name: 'Type: Chore', color: '6e7781', description: 'Maintenance, dependencies, CI' },
	{ name: 'Type: Breaking', color: 'b60205', description: 'Breaking change' },
	{ name: 'Type: Indexer', color: 'c5def5', description: 'Indexer request/issue' },

	// Status Labels (Yellow/Orange family)
	{ name: 'Status: Pending', color: 'fbca04', description: 'Awaiting initial review' },
	{ name: 'Status: Confirmed', color: '0e8a16', description: 'Verified and accepted' },
	{ name: 'Status: In Progress', color: 'ff9f1c', description: 'Actively being worked on' },
	{ name: 'Status: Blocked', color: 'e99695', description: 'Waiting on external factor' },
	{ name: 'Status: Needs Info', color: 'd876e3', description: 'Waiting for reporter response' },
	{ name: 'Status: Ready', color: '2ea44f', description: 'Ready for review/merge' },

	// Priority Labels (Red gradient)
	{ name: 'Priority: Critical', color: 'b60205', description: 'Requires immediate attention' },
	{ name: 'Priority: High', color: 'd93f0b', description: 'Should be addressed soon' },
	{ name: 'Priority: Medium', color: 'fbca04', description: 'Normal priority' },
	{ name: 'Priority: Low', color: '6e7781', description: 'Nice to have, when time permits' },

	// Area Labels (Purple/Violet family)
	{ name: 'Area: UI', color: '7057ff', description: 'Frontend/UI components' },
	{ name: 'Area: API', color: '6f42c1', description: 'Backend API routes' },
	{ name: 'Area: Indexers', color: '8b5cf6', description: 'Indexer system' },
	{ name: 'Area: Downloads', color: 'a855f7', description: 'Download clients' },
	{ name: 'Area: Library', color: 'c084fc', description: 'Library management/scanning' },
	{ name: 'Area: Subtitles', color: 'd8b4fe', description: 'Subtitle providers' },
	{ name: 'Area: Monitoring', color: '9333ea', description: 'Scheduler/automation' },
	{ name: 'Area: Database', color: '7c3aed', description: 'Database/schema' },
	{ name: 'Area: Quality', color: 'a78bfa', description: 'Quality profiles/scoring' },
	{ name: 'Area: Notifications', color: 'e879f9', description: 'Notification system' },
	{ name: 'Area: Integrations', color: 'f0abfc', description: 'External service integrations' },
	{ name: 'Area: Docker', color: '06b6d4', description: 'Docker/deployment' },

	// Meta Labels
	{ name: 'Good First Issue', color: '7057ff', description: 'Good for newcomers' },
	{ name: 'Help Wanted', color: '008672', description: 'Extra attention needed' },
	{ name: 'Duplicate', color: 'cfd3d7', description: 'Already exists' },
	{ name: 'Wontfix', color: 'ffffff', description: 'Will not be addressed' },
	{ name: 'Dependencies', color: '0366d6', description: 'Dependency updates' }
];

function gh(args: string[]): string {
	try {
		return execFileSync('gh', args, { encoding: 'utf-8', stdio: 'pipe' });
	} catch {
		return '';
	}
}

interface GhLabel {
	name: string;
	color: string;
	description: string;
}

function getExistingLabels(): GhLabel[] {
	const output = gh(['label', 'list', '--limit', '200', '--json', 'name,color,description']);
	if (!output) return [];
	try {
		return JSON.parse(output);
	} catch {
		return [];
	}
}

function deleteLabel(name: string, dryRun: boolean): void {
	console.log(`  DELETE: ${name}`);
	if (!dryRun) {
		gh(['label', 'delete', name, '--yes']);
	}
}

function createLabel(label: Label, dryRun: boolean): void {
	console.log(`  CREATE: ${label.name} (#${label.color})`);
	if (!dryRun) {
		gh(['label', 'create', label.name, '--color', label.color, '--description', label.description]);
	}
}

function updateLabel(label: Label, dryRun: boolean): void {
	console.log(`  UPDATE: ${label.name} (#${label.color})`);
	if (!dryRun) {
		gh(['label', 'edit', label.name, '--color', label.color, '--description', label.description]);
	}
}

function main(): void {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const deleteUnknown = args.includes('--delete');

	if (dryRun) {
		console.log('DRY RUN - No changes will be made\n');
	}

	console.log('Fetching existing labels...');
	const existing = getExistingLabels();
	const existingMap = new Map(existing.map((l) => [l.name, l]));
	const schemaNames = new Set(LABELS.map((l) => l.name));

	console.log(`Found ${existing.length} existing labels\n`);

	// Delete labels not in schema
	if (deleteUnknown) {
		console.log('Deleting labels not in schema:');
		let deleted = 0;
		for (const label of existing) {
			if (!schemaNames.has(label.name)) {
				deleteLabel(label.name, dryRun);
				deleted++;
			}
		}
		if (deleted === 0) {
			console.log('  (none)');
		}
		console.log();
	}

	// Create or update labels
	console.log('Creating/updating labels:');
	let created = 0;
	let updated = 0;

	for (const label of LABELS) {
		const existingLabel = existingMap.get(label.name);

		if (!existingLabel) {
			createLabel(label, dryRun);
			created++;
		} else if (
			existingLabel.color.toLowerCase() !== label.color.toLowerCase() ||
			existingLabel.description !== label.description
		) {
			updateLabel(label, dryRun);
			updated++;
		}
	}

	if (created === 0 && updated === 0) {
		console.log('  (all labels up to date)');
	}

	console.log();
	console.log('Summary:');
	console.log(`  Created: ${created}`);
	console.log(`  Updated: ${updated}`);
	if (deleteUnknown) {
		console.log(`  Deleted: ${existing.length - schemaNames.size}`);
	}

	if (dryRun) {
		console.log('\nRun without --dry-run to apply changes');
	}
}

main();
