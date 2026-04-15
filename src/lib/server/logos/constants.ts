import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR || 'data';

export const LOGO_REPO_PATH_PREFIX = 'data/channel-logos/';
export const LOGOS_DIR = join(DATA_DIR, 'channel-logos');
