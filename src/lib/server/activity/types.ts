import type { downloadQueue, downloadHistory, monitoringHistory } from '$lib/server/db/schema';

// Export inferred types from Drizzle schema
export type DownloadQueueRecord = typeof downloadQueue.$inferSelect;
export type DownloadHistoryRecord = typeof downloadHistory.$inferSelect;
export type MonitoringHistoryRecord = typeof monitoringHistory.$inferSelect;
