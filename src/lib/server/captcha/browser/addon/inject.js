// @ts-nocheck
/*
 * Shadow-root unlock patch.
 *
 * Runs in the page's MAIN world at document_start (in every frame) so it patches
 * Element.prototype.attachShadow BEFORE any page script creates a shadow root.
 * Forcing `mode: 'open'` makes otherwise-closed shadow roots (e.g. Cloudflare's
 * Turnstile widget) reachable via element.shadowRoot, which lets a trusted
 * Playwright click reach the challenge checkbox.
 *
 * Technique adapted from techinz/playwright-captcha (Apache-2.0). Reimplemented
 * here to keep captcha solving fully first-party (no runtime dependency).
 */
(() => {
	if (window._cnpgShadowPatched) return;
	window._cnpgShadowPatched = true;

	const shadowRoots = new WeakMap();

	const originalAttachShadow = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function (init) {
		const root = originalAttachShadow.call(this, { ...init, mode: 'open' });
		shadowRoots.set(this, root);
		return root;
	};

	const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'shadowRoot');
	if (descriptor && descriptor.get) {
		const originalGetter = descriptor.get;
		Object.defineProperty(Element.prototype, 'shadowRoot', {
			get() {
				return originalGetter.call(this) || shadowRoots.get(this);
			},
			configurable: true,
			enumerable: descriptor.enumerable
		});
	}
})();
