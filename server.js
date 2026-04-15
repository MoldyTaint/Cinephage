/**
 * Custom server entry point for production.
 *
 * This wraps the SvelteKit adapter-node server to configure HTTP settings
 * that improve compatibility with reverse proxies like Nginx.
 *
 * Issue: Node.js has a default keepAliveTimeout of 5 seconds, but reverse
 * proxies (Nginx, Traefik, etc.) typically use 60-75 seconds. This mismatch
 * causes 502 Bad Gateway errors when the proxy tries to reuse a connection
 * that Node already closed.
 *
 * Solution: Set keepAliveTimeout higher than the proxy's timeout.
 */

// Load .env into process.env before any application code runs.
// In dev Vite handles this automatically; in production we need it explicitly.
// If no .env file exists (e.g. Docker with env vars passed directly), this is a no-op.
import 'dotenv/config';

import { server } from './build/index.js';

// Set keepAliveTimeout to 65 seconds (higher than typical proxy timeouts of 60s)
// This prevents 502 errors from connection reuse issues
server.server.keepAliveTimeout = 65000;

// headersTimeout must be higher than keepAliveTimeout
// This is how long the server waits for request headers
server.server.headersTimeout = 66000;

console.log('Server configured with keepAliveTimeout=65s for reverse proxy compatibility');
