const CSP_HEADER = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https: http:",
	"connect-src 'self'",
	"font-src 'self'",
	"media-src 'self' blob: https: http:",
	"object-src 'none'",
	"child-src 'self'",
	"frame-ancestors 'self'"
].join('; ');

const SECURITY_HEADERS = {
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Content-Security-Policy': CSP_HEADER
};

const BASE_SECURITY_HEADERS = {
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export { CSP_HEADER, SECURITY_HEADERS, BASE_SECURITY_HEADERS };
