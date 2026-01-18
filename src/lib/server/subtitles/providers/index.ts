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
export { OpenSubtitlesProvider } from './opensubtitles/OpenSubtitlesProvider';
export { OpenSubtitlesOrgProvider } from './opensubtitlesorg/OpenSubtitlesOrgProvider';
export { PodnapisiProvider } from './podnapisi/PodnapisiProvider';
export { SubsceneProvider } from './subscene/SubsceneProvider';
export { Addic7edProvider } from './addic7ed/Addic7edProvider';
export { SubDLProvider } from './subdl/SubDLProvider';
export { YIFYSubtitlesProvider } from './yifysubtitles/YIFYSubtitlesProvider';
export { GestdownProvider } from './gestdown/GestdownProvider';
export { Subf2mProvider } from './subf2m/Subf2mProvider';

// Regional providers
export { NapiprojektProvider } from './napiprojekt/NapiprojektProvider';
export { LegendasdivxProvider } from './legendasdivx/LegendasdivxProvider';
export { BetaseriesProvider } from './betaseries/BetaseriesProvider';
export { AssrtProvider } from './assrt/AssrtProvider';

// OpenSubtitles utilities
export { calculateOpenSubtitlesHash, canHashFile } from './opensubtitles/hash';
