/**
 * localStorage keys holding the full filtered library list URL to restore
 * when navigating back from a media detail page (issue #515).
 * Written by the list pages' beforeNavigate hooks; read by the detail pages.
 */
export const MOVIES_RETURN_URL_KEY = 'cinephage:library:movies:returnUrl';
export const TV_RETURN_URL_KEY = 'cinephage:library:tv:returnUrl';
