/**
 * Subtitle Management System
 *
 * Comprehensive subtitle handling inspired by Bazarr,
 * with multiple providers, language profiles, and auto-sync.
 */

// Core types
export * from './types';

// Requirement matching (single source of truth for subtitle requirement tuples)
export * from './requirement-matcher';

// Video objects (Bazarr-style)
export * from './video';

// Language handling (Bazarr-style)
export * from './language';

// Subtitle class (Bazarr-style)
export * from './subtitle';

// Scoring system
export * from './score';

// Provider pool
export * from './pool';

// Encoding handling
export * from './encoding';

// Subtitle modifications
export * from './modifications';

// Release parsing
export * from './refiners';

// Provider layer
export * from './providers';

// Services
export * from './services';
