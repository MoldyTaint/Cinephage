import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists, tableExists } from '../migration-helpers.js';

export const migration_v128: MigrationDefinition = {
	version: 128,
	name: 'add_diagnostic_report_tables',
	apply: (sqlite) => {
		// Extend unmatched_files with diagnostic columns
		if (!columnExists(sqlite, 'unmatched_files', 'correlation_id')) {
			sqlite.prepare(`ALTER TABLE "unmatched_files" ADD COLUMN "correlation_id" text`).run();
		}
		if (!columnExists(sqlite, 'unmatched_files', 'ambiguity_margin')) {
			sqlite.prepare(`ALTER TABLE "unmatched_files" ADD COLUMN "ambiguity_margin" real`).run();
		}

		// rejected_releases: pipeline stage 1 - release found, rejected before download
		if (!tableExists(sqlite, 'rejected_releases')) {
			sqlite
				.prepare(
					`CREATE TABLE "rejected_releases" (
					"id" text PRIMARY KEY NOT NULL,
					"correlation_id" text,
					"release_title" text NOT NULL,
					"indexer_name" text,
					"protocol" text,
					"tmdb_id" integer,
					"media_type" text,
					"media_title" text,
					"rejection_reasons" text,
					"quality_profile_name" text,
					"release_size" integer,
					"release_group" text,
					"rejected_at" text NOT NULL,
					"status" text NOT NULL DEFAULT 'rejected'
				)`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_rejected_releases_rejected_at" ON "rejected_releases" ("rejected_at")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_rejected_releases_tmdb" ON "rejected_releases" ("tmdb_id", "media_type")`
				)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_rejected_releases_status" ON "rejected_releases" ("status")`)
				.run();
		}

		// import_failures: pipeline stage 2 - download completed, import itself failed
		if (!tableExists(sqlite, 'import_failures')) {
			sqlite
				.prepare(
					`CREATE TABLE "import_failures" (
					"id" text PRIMARY KEY NOT NULL,
					"correlation_id" text,
					"release_title" text NOT NULL,
					"source_path" text,
					"destination_path" text,
					"failure_stage" text NOT NULL,
					"reason" text NOT NULL,
					"reason_detail" text,
					"dangerous_files" text,
					"attempt_count" integer NOT NULL DEFAULT 1,
					"download_client_id" text,
					"failed_at" text NOT NULL,
					"status" text NOT NULL DEFAULT 'failed',
					"resolved_at" text
				)`
				)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_import_failures_failed_at" ON "import_failures" ("failed_at")`)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_import_failures_status" ON "import_failures" ("status")`)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_import_failures_stage" ON "import_failures" ("failure_stage")`)
				.run();
		}

		// renaming_failures: pipeline stage 3 - file imported, rename/organize step failed
		if (!tableExists(sqlite, 'renaming_failures')) {
			sqlite
				.prepare(
					`CREATE TABLE "renaming_failures" (
					"id" text PRIMARY KEY NOT NULL,
					"correlation_id" text,
					"file_id" text NOT NULL,
					"file_type" text NOT NULL,
					"source_path" text NOT NULL,
					"intended_path" text NOT NULL,
					"naming_template" text,
					"reason" text NOT NULL,
					"reason_detail" text,
					"failed_at" text NOT NULL,
					"status" text NOT NULL DEFAULT 'failed',
					"resolved_at" text
				)`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_renaming_failures_failed_at" ON "renaming_failures" ("failed_at")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_renaming_failures_file" ON "renaming_failures" ("file_id", "file_type")`
				)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_renaming_failures_status" ON "renaming_failures" ("status")`)
				.run();
		}

		// metadata_conflicts: pipeline stage 4 - file matched, metadata providers disagree
		if (!tableExists(sqlite, 'metadata_conflicts')) {
			sqlite
				.prepare(
					`CREATE TABLE "metadata_conflicts" (
					"id" text PRIMARY KEY NOT NULL,
					"correlation_id" text,
					"tmdb_id" integer NOT NULL,
					"media_type" text NOT NULL,
					"media_title" text,
					"conflict_type" text NOT NULL,
					"providers_checked" text,
					"provider_results" text,
					"detected_at" text NOT NULL,
					"status" text NOT NULL DEFAULT 'unresolved',
					"resolved_at" text
				)`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_metadata_conflicts_tmdb" ON "metadata_conflicts" ("tmdb_id", "media_type")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX "idx_metadata_conflicts_detected_at" ON "metadata_conflicts" ("detected_at")`
				)
				.run();
			sqlite
				.prepare(`CREATE INDEX "idx_metadata_conflicts_status" ON "metadata_conflicts" ("status")`)
				.run();
		}
	}
};
