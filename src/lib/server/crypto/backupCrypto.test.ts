import { describe, expect, it } from 'vitest';

import { decryptBackupPayload, encryptBackupPayload } from './backupCrypto.js';

describe('backupCrypto', () => {
	it('round-trips encrypted backup payloads', () => {
		const payload = {
			indexers: {
				a: {
					settings: {
						username: 'demo',
						password: 'secret'
					}
				}
			}
		};

		const encrypted = encryptBackupPayload(payload, 'correct horse battery staple');
		const decrypted = decryptBackupPayload(encrypted, 'correct horse battery staple');

		expect(decrypted).toEqual(payload);
	});

	it('fails to decrypt with wrong passphrase', () => {
		const encrypted = encryptBackupPayload({ value: 'secret' }, 'right-passphrase');

		expect(() => decryptBackupPayload(encrypted, 'wrong-passphrase')).toThrow();
	});
});
