export type ReleaseLineVariant = 'released' | 'upcoming' | 'theaters' | 'announced';

export interface SmartReleaseLineResult {
	text: string;
	variant: ReleaseLineVariant;
}

export interface ReleaseLineInput {
	releaseDate: string | null | undefined;
	digitalReleaseDate: string | null | undefined;
	physicalReleaseDate: string | null | undefined;
	status?: string | null;
}

export function getSmartReleaseLine(
	input: ReleaseLineInput | null | undefined,
	now: Date = new Date()
): SmartReleaseLineResult | null {
	if (!input) return null;

	const { releaseDate, digitalReleaseDate, physicalReleaseDate, status } = input;
	const nowMs = now.getTime();

	const digitalMs = digitalReleaseDate ? new Date(digitalReleaseDate).getTime() : null;
	const physicalMs = physicalReleaseDate ? new Date(physicalReleaseDate).getTime() : null;
	const theatricalMs = releaseDate ? new Date(releaseDate).getTime() : null;

	const digitalPast = digitalMs !== null && !Number.isNaN(digitalMs) && digitalMs <= nowMs;
	const physicalPast = physicalMs !== null && !Number.isNaN(physicalMs) && physicalMs <= nowMs;
	const theatricalPast =
		theatricalMs !== null && !Number.isNaN(theatricalMs) && theatricalMs <= nowMs;

	if (digitalPast || physicalPast) {
		if (digitalPast) return { text: 'Available - Digital', variant: 'released' };
		return { text: 'Available - Physical', variant: 'released' };
	}

	if (theatricalPast) {
		const nextRelease = getEarliestFuture(digitalMs, physicalMs, nowMs);
		if (nextRelease) {
			const days = Math.ceil((nextRelease.ms - nowMs) / (1000 * 60 * 60 * 24));
			return { text: `${nextRelease.type} in ${days} days`, variant: 'upcoming' };
		}
		if (status === 'Released') {
			return { text: 'Available', variant: 'released' };
		}
		return { text: 'In Theaters', variant: 'theaters' };
	}

	if (theatricalMs !== null && !Number.isNaN(theatricalMs)) {
		const days = Math.ceil((theatricalMs - nowMs) / (1000 * 60 * 60 * 24));
		return { text: `In Theaters in ${days} days`, variant: 'upcoming' };
	}

	return { text: 'Announced', variant: 'announced' };
}

function getEarliestFuture(
	digitalMs: number | null,
	physicalMs: number | null,
	nowMs: number
): { ms: number; type: string } | null {
	const candidates: { ms: number; type: string }[] = [];

	if (digitalMs !== null && !Number.isNaN(digitalMs) && digitalMs > nowMs) {
		candidates.push({ ms: digitalMs, type: 'Digital' });
	}
	if (physicalMs !== null && !Number.isNaN(physicalMs) && physicalMs > nowMs) {
		candidates.push({ ms: physicalMs, type: 'Physical' });
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => a.ms - b.ms);
	return candidates[0];
}
