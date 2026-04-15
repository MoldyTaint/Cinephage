import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

export interface EncryptedBackupPayload {
	algorithm: 'aes-256-gcm';
	salt: string;
	iv: string;
	authTag: string;
	ciphertext: string;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
	return scryptSync(passphrase, salt, KEY_LENGTH);
}

export function encryptBackupPayload(
	payload: Record<string, unknown>,
	passphrase: string
): EncryptedBackupPayload {
	const salt = randomBytes(SALT_LENGTH);
	const iv = randomBytes(IV_LENGTH);
	const key = deriveKey(passphrase, salt);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const serialized = JSON.stringify(payload);

	const ciphertext = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return {
		algorithm: 'aes-256-gcm',
		salt: salt.toString('base64'),
		iv: iv.toString('base64'),
		authTag: authTag.toString('base64'),
		ciphertext: ciphertext.toString('base64')
	};
}

export function decryptBackupPayload(
	encrypted: EncryptedBackupPayload,
	passphrase: string
): Record<string, unknown> {
	const salt = Buffer.from(encrypted.salt, 'base64');
	const iv = Buffer.from(encrypted.iv, 'base64');
	const authTag = Buffer.from(encrypted.authTag, 'base64');
	const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
	const key = deriveKey(passphrase, salt);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	return JSON.parse(decrypted) as Record<string, unknown>;
}
