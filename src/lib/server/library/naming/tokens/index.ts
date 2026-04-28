/**
 * Token module - Single source of truth for all naming tokens
 */

import { tokenRegistry } from './registry';
import { coreTokens } from './definitions/core';
import { qualityTokens } from './definitions/quality';
import { videoTokens } from './definitions/video';
import { audioTokens } from './definitions/audio';
import { releaseTokens } from './definitions/release';
import { mediaIdTokens } from './definitions/mediaId';
import { episodeTokens } from './definitions/episode';
import { collectionTokens } from './definitions/collection';

// Register all tokens
tokenRegistry.registerAll(coreTokens);
tokenRegistry.registerAll(qualityTokens);
tokenRegistry.registerAll(videoTokens);
tokenRegistry.registerAll(audioTokens);
tokenRegistry.registerAll(releaseTokens);
tokenRegistry.registerAll(mediaIdTokens);
tokenRegistry.registerAll(episodeTokens);
tokenRegistry.registerAll(collectionTokens);

// Export registry and types
export { tokenRegistry, TokenRegistry } from './registry';
export type {
	TokenDefinition,
	TokenCategory,
	TokenApplicability,
	TokenMetadata,
	TokenValidationResult
} from './types';

// Export individual token sets for testing
export { coreTokens } from './definitions/core';
export { qualityTokens } from './definitions/quality';
export { videoTokens } from './definitions/video';
export { audioTokens } from './definitions/audio';
export { releaseTokens } from './definitions/release';
export { mediaIdTokens } from './definitions/mediaId';
export { episodeTokens } from './definitions/episode';
export { collectionTokens } from './definitions/collection';
