import { describe, it, expect } from 'vitest';
import { stripSecureFromSetCookie, stripSecureCookiesForLocalHttp } from './session-helpers.js';
import type { Handle } from '@sveltejs/kit/hooks';

type RequestEvent = Parameters<Handle>[0]['event'];

function makeEvent(url: string, headers: Record<string, string> = {}): RequestEvent {
	return {
		url: new URL(url),
		request: new Request(url, { headers })
	} as unknown as RequestEvent;
}

describe('stripSecureFromSetCookie', () => {
	it('removes Secure case-insensitively, leaves other attributes intact', () => {
		expect(
			stripSecureFromSetCookie('cinephage.session=abc; Path=/; HttpOnly; Secure; SameSite=Lax')
		).toBe('cinephage.session=abc; Path=/; HttpOnly; SameSite=Lax');
		expect(stripSecureFromSetCookie('a=b; secure')).toBe('a=b');
		expect(stripSecureFromSetCookie('a=b; SECURE; Path=/')).toBe('a=b; Path=/');
	});

	it('no-ops on a cookie without Secure', () => {
		expect(stripSecureFromSetCookie('a=b; Path=/; HttpOnly')).toBe('a=b; Path=/; HttpOnly');
	});
});

describe('stripSecureCookiesForLocalHttp', () => {
	function responseWithCookie(cookie: string): Response {
		return new Response(null, { headers: { 'set-cookie': cookie } });
	}

	it('strips Secure for a direct LAN http request', async () => {
		const event = makeEvent('http://192.168.1.10:3000/api/auth/sign-in/username');
		const response = responseWithCookie('cinephage.session=abc; Path=/; HttpOnly; Secure');

		const result = stripSecureCookiesForLocalHttp(event, response);

		expect(result.headers.getSetCookie()).toEqual(['cinephage.session=abc; Path=/; HttpOnly']);
	});

	it('keeps Secure when X-Forwarded-Proto: https is present, even on a private-IP Host', () => {
		const event = makeEvent('http://192.168.1.10:3000/api/auth/sign-in/username', {
			'x-forwarded-proto': 'https'
		});
		const response = responseWithCookie('cinephage.session=abc; Path=/; HttpOnly; Secure');

		const result = stripSecureCookiesForLocalHttp(event, response);

		expect(result.headers.getSetCookie()).toEqual([
			'cinephage.session=abc; Path=/; HttpOnly; Secure'
		]);
	});

	it('keeps Secure for a public-domain (reverse-proxied) request', () => {
		const event = makeEvent('http://proxy.example.com/api/auth/sign-in/username');
		const response = responseWithCookie('cinephage.session=abc; Path=/; HttpOnly; Secure');

		const result = stripSecureCookiesForLocalHttp(event, response);

		expect(result.headers.getSetCookie()).toEqual([
			'cinephage.session=abc; Path=/; HttpOnly; Secure'
		]);
	});

	it('is a no-op when the response sets no cookies', () => {
		const event = makeEvent('http://192.168.1.10:3000/health');
		const response = new Response('ok');

		const result = stripSecureCookiesForLocalHttp(event, response);

		expect(result).toBe(response);
	});

	it('is a no-op when the response cookie already has no Secure attribute', () => {
		const event = makeEvent('http://192.168.1.10:3000/api/auth/sign-in/username');
		const response = responseWithCookie('cinephage.session=abc; Path=/; HttpOnly');

		const result = stripSecureCookiesForLocalHttp(event, response);

		expect(result).toBe(response);
	});
});
