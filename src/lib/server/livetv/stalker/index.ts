/**
 * Stalker Portal Module
 *
 * Exports for Stalker/Ministra protocol IPTV integration.
 * This module provides portal scanning and MAC address discovery functionality.
 */

// Portal-specific functionality (used for portal scanning)
export { StalkerPortalClient, createStalkerClient } from './StalkerPortalClient';
export { StalkerPortalManager, getStalkerPortalManager } from './StalkerPortalManager';
export type {
	StalkerPortal,
	CreatePortalInput,
	UpdatePortalInput,
	PortalDetectionResult,
	PortalTestResult,
	PortalScanSummary
} from './StalkerPortalManager';
export { MacGenerator, MAC_PREFIXES } from './MacGenerator';
export type { MacPrefix } from './MacGenerator';
export { PortalScannerService, getPortalScannerService } from './PortalScannerService';
export type {
	ScanResult,
	ScanHistoryEntry,
	RandomScanOptions,
	SequentialScanOptions,
	ImportScanOptions
} from './PortalScannerService';
