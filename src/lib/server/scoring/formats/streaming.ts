/**
 * Streaming Service Format Definitions
 *
 * Defines streaming service identification for quality scoring.
 * Some services are known for higher quality encodes.
 */

import type { CustomFormat } from '../types.js';

/**
 * Premium Streaming Services (known for high quality)
 */
export const PREMIUM_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-atvp',
		name: 'ATVP',
		description: 'Apple TV+ - Known for high bitrate encodes',
		category: 'streaming',
		tags: ['Streaming', 'Premium', 'Apple'],
		conditions: [
			{
				name: 'ATVP',
				type: 'release_title',
				pattern: '\\b(ATVP|AppleTV\\+?|Apple[. ]?TV)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-amzn',
		name: 'AMZN',
		description: 'Amazon Prime Video',
		category: 'streaming',
		tags: ['Streaming', 'Premium', 'Amazon'],
		conditions: [
			{
				name: 'AMZN',
				type: 'release_title',
				pattern: '\\b(AMZN|Amazon)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-nf',
		name: 'NF',
		description: 'Netflix',
		category: 'streaming',
		tags: ['Streaming', 'Premium', 'Netflix'],
		conditions: [
			{
				name: 'NF',
				type: 'release_title',
				pattern: '\\b(NF|Netflix)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-dsnp',
		name: 'DSNP',
		description: 'Disney+',
		category: 'streaming',
		tags: ['Streaming', 'Premium', 'Disney'],
		conditions: [
			{
				name: 'DSNP',
				type: 'release_title',
				pattern: '\\b(DSNP|Disney\\+?|DisneyPlus)\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * HBO/Max Services
 */
export const HBO_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-hmax',
		name: 'HMAX',
		description: 'HBO Max (legacy)',
		category: 'streaming',
		tags: ['Streaming', 'HBO'],
		conditions: [
			{
				name: 'HMAX',
				type: 'release_title',
				pattern: '\\b(HMAX|HBO[. ]?Max)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-max',
		name: 'MAX',
		description: 'Max (formerly HBO Max)',
		category: 'streaming',
		tags: ['Streaming', 'HBO', 'Max'],
		conditions: [
			{
				name: 'MAX',
				type: 'release_title',
				pattern: '\\bMAX\\b',
				required: true,
				negate: false
			},
			{
				name: 'Not HMAX',
				type: 'release_title',
				pattern: '\\bHMAX\\b',
				required: true,
				negate: true
			}
		]
	}
];

/**
 * Standard Streaming Services
 */
export const STANDARD_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-pcok',
		name: 'PCOK',
		description: 'Peacock',
		category: 'streaming',
		tags: ['Streaming', 'Peacock'],
		conditions: [
			{
				name: 'PCOK',
				type: 'release_title',
				pattern: '\\b(PCOK|Peacock)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-pmtp',
		name: 'PMTP',
		description: 'Paramount+',
		category: 'streaming',
		tags: ['Streaming', 'Paramount'],
		conditions: [
			{
				name: 'PMTP',
				type: 'release_title',
				pattern: '\\b(PMTP|Paramount\\+?)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-hulu',
		name: 'HULU',
		description: 'Hulu',
		category: 'streaming',
		tags: ['Streaming', 'Hulu'],
		conditions: [
			{
				name: 'HULU',
				type: 'release_title',
				pattern: '\\bHULU\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-it',
		name: 'iT',
		description: 'iTunes',
		category: 'streaming',
		tags: ['Streaming', 'iTunes', 'Apple'],
		conditions: [
			{
				name: 'iT',
				type: 'release_title',
				pattern: '\\b(iT|iTunes)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-stan',
		name: 'STAN',
		description: 'Stan (Australian)',
		category: 'streaming',
		tags: ['Streaming', 'Stan', 'Australia'],
		conditions: [
			{
				name: 'STAN',
				type: 'release_title',
				pattern: '\\bSTAN\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-crav',
		name: 'CRAV',
		description: 'Crave (Canadian)',
		category: 'streaming',
		tags: ['Streaming', 'Crave', 'Canada'],
		conditions: [
			{
				name: 'CRAV',
				type: 'release_title',
				pattern: '\\b(CRAV|Crave)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-now',
		name: 'NOW',
		description: 'NOW TV',
		category: 'streaming',
		tags: ['Streaming', 'NOW'],
		conditions: [
			{
				name: 'NOW',
				type: 'release_title',
				pattern: '\\bNOW\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-sho',
		name: 'SHO',
		description: 'Showtime',
		category: 'streaming',
		tags: ['Streaming', 'Showtime'],
		conditions: [
			{
				name: 'SHO',
				type: 'release_title',
				pattern: '\\b(SHO|Showtime)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-roku',
		name: 'ROKU',
		description: 'Roku Channel',
		category: 'streaming',
		tags: ['Streaming', 'Roku'],
		conditions: [
			{
				name: 'ROKU',
				type: 'release_title',
				pattern: '\\bROKU\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Specialty Streaming Services
 */
export const SPECIALTY_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-mubi',
		name: 'MUBI',
		description: 'MUBI - Arthouse/indie film streaming',
		category: 'streaming',
		tags: ['Streaming', 'MUBI', 'Arthouse'],
		conditions: [
			{
				name: 'MUBI',
				type: 'release_title',
				pattern: '\\bMUBI\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-crit',
		name: 'CRIT',
		description: 'Criterion Channel',
		category: 'streaming',
		tags: ['Streaming', 'Criterion', 'Arthouse'],
		conditions: [
			{
				name: 'CRIT',
				type: 'release_title',
				pattern: '\\b(CRIT|Criterion)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-ds4k',
		name: 'DS4K',
		description: 'Disney 4K (distinct from DSNP)',
		category: 'streaming',
		tags: ['Streaming', 'Disney', '4K'],
		conditions: [
			{
				name: 'DS4K',
				type: 'release_title',
				pattern: '\\bDS4K\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Asian Streaming Services
 */
export const ASIAN_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-iqiyi',
		name: 'iQIYI',
		description: 'iQIYI - Chinese streaming platform',
		category: 'streaming',
		tags: ['Streaming', 'iQIYI', 'China'],
		conditions: [
			{
				name: 'iQIYI',
				type: 'release_title',
				pattern: '\\b(iQIYI|IQIYI)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-tving',
		name: 'TVING',
		description: 'TVING - Korean streaming platform',
		category: 'streaming',
		tags: ['Streaming', 'TVING', 'Korea'],
		conditions: [
			{
				name: 'TVING',
				type: 'release_title',
				pattern: '\\bTVING\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-viki',
		name: 'VIKI',
		description: 'Viki - Asian drama streaming',
		category: 'streaming',
		tags: ['Streaming', 'VIKI', 'Asian'],
		conditions: [
			{
				name: 'VIKI',
				type: 'release_title',
				pattern: '\\bVIKI\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-viu',
		name: 'VIU',
		description: 'Viu - Asian content streaming',
		category: 'streaming',
		tags: ['Streaming', 'VIU', 'Asian'],
		conditions: [
			{
				name: 'VIU',
				type: 'release_title',
				pattern: '\\bVIU\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-wavve',
		name: 'WAVVE',
		description: 'Wavve - Korean streaming platform',
		category: 'streaming',
		tags: ['Streaming', 'WAVVE', 'Korea'],
		conditions: [
			{
				name: 'WAVVE',
				type: 'release_title',
				pattern: '\\bWAVVE\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-wetv',
		name: 'WeTV',
		description: 'WeTV - Tencent Asian streaming',
		category: 'streaming',
		tags: ['Streaming', 'WeTV', 'Asian', 'Tencent'],
		conditions: [
			{
				name: 'WeTV',
				type: 'release_title',
				pattern: '\\bWeTV\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-kocowa',
		name: 'KOCOWA',
		description: 'KOCOWA - Korean content streaming',
		category: 'streaming',
		tags: ['Streaming', 'KOCOWA', 'Korea'],
		conditions: [
			{
				name: 'KOCOWA',
				type: 'release_title',
				pattern: '\\b(KOCOWA|KCW)\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * International Streaming Services
 */
export const INTERNATIONAL_STREAMING_FORMATS: CustomFormat[] = [
	{
		id: 'streaming-bcore',
		name: 'BCORE',
		description: 'Bravia Core (Sony)',
		category: 'streaming',
		tags: ['Streaming', 'Sony', 'Premium'],
		conditions: [
			{
				name: 'BCORE',
				type: 'release_title',
				pattern: '\\b(BCORE|Bravia[. ]?Core)\\b',
				required: true,
				negate: false
			}
		]
	},
	{
		id: 'streaming-ma',
		name: 'MA',
		description: 'Movies Anywhere',
		category: 'streaming',
		tags: ['Streaming', 'Movies Anywhere'],
		conditions: [
			{
				name: 'MA',
				type: 'release_title',
				pattern: '\\bMA\\b',
				required: true,
				negate: false
			}
		]
	}
];

/**
 * Streaming Protocol Format
 * Matches releases from the CinephageStream indexer (marked with [Streaming] tag)
 */
export const STREAMING_PROTOCOL_FORMAT: CustomFormat = {
	id: 'streaming-protocol',
	name: 'Streaming Release',
	description: 'Release from CinephageStream indexer - instant playback via .strm files',
	category: 'streaming',
	tags: ['Streaming', 'Protocol', 'Instant'],
	conditions: [
		{
			name: 'Streaming Tag',
			type: 'release_title',
			pattern: '\\[Streaming\\]',
			required: true,
			negate: false
		}
	]
};

/**
 * All streaming service formats
 */
export const ALL_STREAMING_FORMATS: CustomFormat[] = [
	...PREMIUM_STREAMING_FORMATS,
	...HBO_STREAMING_FORMATS,
	...STANDARD_STREAMING_FORMATS,
	...SPECIALTY_STREAMING_FORMATS,
	...ASIAN_STREAMING_FORMATS,
	...INTERNATIONAL_STREAMING_FORMATS,
	STREAMING_PROTOCOL_FORMAT
];
