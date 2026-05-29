/**
 * Subtitle Providers - Module exports
 */

// Core interfaces
export * from './interfaces';

// Base class
export { BaseSubtitleProvider, ProviderState } from './BaseProvider';
export type { ProviderCapabilities } from './BaseProvider';

// Factory
export { SubtitleProviderFactory, getSubtitleProviderFactory } from './SubtitleProviderFactory';

// Provider Registry (auto-discovery)
export { providerRegistry, registerBuiltinProviders, ensureProvidersRegistered } from './registry';
export type { ProviderInfo, ProviderConstructor } from './registry';

// Mixins
export * from './mixins';

// Provider implementations

// Regional providers
export { NapiprojektProvider } from './napiprojekt/NapiprojektProvider';
export { LegendasdivxProvider } from './legendasdivx/LegendasdivxProvider';
export { BetaseriesProvider } from './betaseries/BetaseriesProvider';
export { AssrtProvider } from './assrt/AssrtProvider';

// OpenSubtitles utilities
export { calculateOpenSubtitlesHash, canHashFile } from './opensubtitles/hash';
