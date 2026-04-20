#!/usr/bin/env node

/**
 * Compute the next project version using a constrained patch cycle:
 *   x.y.0 -> x.y.1 -> ... -> x.y.9 -> x.(y+1).0
 *
 * Usage:
 *   node scripts/next-version.js           # prints next version
 *   node scripts/next-version.js --write   # updates package.json version + prints next version
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON_PATH = new URL('../package.json', import.meta.url);
const PACKAGE_LOCK_JSON_PATH = new URL('../package-lock.json', import.meta.url);
const shouldWrite = process.argv.includes('--write');

const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8');
const pkg = JSON.parse(raw);
const version = String(pkg.version ?? '').trim();
const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
	console.error(`Invalid package.json version: "${version}". Expected MAJOR.MINOR.PATCH`);
	process.exit(1);
}

const major = Number.parseInt(match[1], 10);
let minor = Number.parseInt(match[2], 10);
let patch = Number.parseInt(match[3], 10);

if (patch < 9) {
	patch += 1;
} else {
	patch = 0;
	minor += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;

if (shouldWrite) {
	pkg.version = nextVersion;
	writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, '\t')}\n`, 'utf8');

	if (existsSync(PACKAGE_LOCK_JSON_PATH)) {
		const lockRaw = readFileSync(PACKAGE_LOCK_JSON_PATH, 'utf8');
		const lock = JSON.parse(lockRaw);
		lock.version = nextVersion;
		if (lock.packages && typeof lock.packages === 'object' && lock.packages['']) {
			lock.packages[''].version = nextVersion;
		}
		writeFileSync(PACKAGE_LOCK_JSON_PATH, `${JSON.stringify(lock, null, '\t')}\n`, 'utf8');
	}
}

console.log(nextVersion);
