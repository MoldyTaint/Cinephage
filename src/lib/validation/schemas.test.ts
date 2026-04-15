import { describe, expect, it } from 'vitest';

import { logDownloadQuerySchema } from './schemas.js';

describe('logDownloadQuerySchema', () => {
	it('accepts export requests up to the supported 5000 row cap', () => {
		const result = logDownloadQuerySchema.safeParse({
			limit: '5000',
			format: 'jsonl',
			levels: 'debug,info,warn,error'
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			return;
		}

		expect(result.data.limit).toBe(5000);
		expect(result.data.levels).toEqual(['debug', 'info', 'warn', 'error']);
		expect(result.data.format).toBe('jsonl');
	});

	it('rejects export requests above the supported 5000 row cap', () => {
		const result = logDownloadQuerySchema.safeParse({
			limit: '5001',
			format: 'jsonl'
		});

		expect(result.success).toBe(false);
	});
});
