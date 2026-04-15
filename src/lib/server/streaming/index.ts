/**
 * Streaming Module
 *
 * Provides streaming functionality for Cinephage including:
 * - Cinephage API-backed playback sessions
 * - HLS playlist parsing and best quality selection
 * - Stream validation for playability verification
 * - Caching for stream URLs
 * - STRM file generation and management
 * - Shared HTTP utilities for providers
 */

// Core types
export * from './types';

// Configuration constants
export * from './constants';

// HLS parsing
export * from './hls';

// Stream validation
export { getStreamValidator, createStreamValidator, quickValidateStream } from './validation';

// STRM file service
export * from './StrmService';

// URL utilities
export * from './url';

// Settings helper
export * from './settings';

// Shared HTTP utilities (also available via ./utils)
export { fetchWithTimeout, checkStreamAvailability, checkHlsAvailability } from './utils';

// Cinephage API playback services
export * from './cinephage-api/CinephageApiService';
export * from './sessions/session-store';
export * from './sessions/PlaybackSessionService';
export * from './sessions/SessionProxyService';
