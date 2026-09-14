/**
 * Title display resolution shared by server and client.
 *
 * Single authority for the "prefer original title" display rule: a per-item
 * flag wins; when the item has no explicit value (null/undefined = unset),
 * the instance default (language_settings.prefer_original_title) fills the
 * gap. Callers that only have per-item data keep working unchanged because
 * the instance default is optional and defaults to false.
 */

/** Item fields needed to decide and render the display title. */
export interface TitleDisplayItem {
	title: string;
	originalTitle?: string | null;
	preferOriginalTitle?: boolean | null;
}

/**
 * Resolve the effective "prefer original title" flag:
 * per-item boolean ?? instance default ?? false.
 */
export function resolvePreferOriginalTitle(
	item: Pick<TitleDisplayItem, 'preferOriginalTitle'>,
	instanceDefault?: boolean | null
): boolean {
	return item.preferOriginalTitle ?? instanceDefault ?? false;
}

/**
 * Pick the title to display: originalTitle when the effective prefer-original
 * flag is on and an originalTitle exists, else the localized title.
 */
export function displayTitle(item: TitleDisplayItem, instanceDefault?: boolean | null): string {
	if (resolvePreferOriginalTitle(item, instanceDefault) && item.originalTitle) {
		return item.originalTitle;
	}
	return item.title;
}
