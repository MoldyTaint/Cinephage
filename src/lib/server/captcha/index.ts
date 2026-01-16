/**
 * Captcha Solver Module
 *
 * Camoufox-based anti-bot/captcha solving system.
 * Camoufox is a Firefox-based anti-detect browser that handles fingerprinting
 * at the C++ level, making it highly effective against Cloudflare and similar protections.
 */

// Main service
export { CaptchaSolver, getCaptchaSolver } from './CaptchaSolver';

// Settings
export {
	CaptchaSolverSettingsService,
	captchaSolverSettingsService
} from './CaptchaSolverSettings';

// Types
export type {
	BrowserFetchRequest,
	BrowserFetchResult,
	ChallengeType,
	ChallengeDetectionResult,
	SolveResult,
	SolveRequest,
	CachedSolveResult,
	CaptchaSolverConfig,
	ProxyConfig,
	SolverStats,
	SolverHealth
} from './types';

export { DEFAULT_CONFIG } from './types';

// Detection utilities (for use by IndexerHttp)
export { isChallengeLikely, getChallengeDescription } from './detection/ChallengeDetector';

// Browser management (for advanced use cases)
export { getCamoufoxManager, shutdownCamoufoxManager } from './browser/CamoufoxManager';

// Browser fetch (for bypassing TLS fingerprinting)
export { browserFetch } from './browser/CamoufoxSolver';
