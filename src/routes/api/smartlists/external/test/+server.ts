/**
 * External List Test API
 * POST /api/smartlists/external/test - Test external list connection
 *
 * Reuses the preview handler, which detects test mode via pathname.
 */
export { POST } from '../preview/+server.js';
