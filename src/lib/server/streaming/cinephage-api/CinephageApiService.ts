import {
	getStreams as gatewayGetStreams,
	type CinephageStreamLookupParams,
	type CinephageStreamLookupResult
} from '$lib/server/cinephage';
import { cinephageHealth } from '$lib/server/cinephage';
import { getCinephageBackendConfig } from '$lib/server/cinephage';

export type { CinephageStreamLookupParams, CinephageStreamLookupResult };

export interface CinephageApiHealth {
	configured: boolean;
	healthy: boolean;
	baseUrl: string;
	missing: string[];
	version?: string;
	commit?: string;
}

export class CinephageApiService {
	async getHealth(): Promise<CinephageApiHealth> {
		const config = await getCinephageBackendConfig();
		const healthy = await cinephageHealth();
		return {
			configured: config.configured,
			healthy,
			baseUrl: config.baseUrl,
			missing: config.missing,
			version: config.version,
			commit: config.commit
		};
	}

	async getStreams(params: CinephageStreamLookupParams): Promise<CinephageStreamLookupResult> {
		return gatewayGetStreams(params);
	}
}

let serviceInstance: CinephageApiService | null = null;

export function getCinephageApiService(): CinephageApiService {
	if (!serviceInstance) {
		serviceInstance = new CinephageApiService();
	}
	return serviceInstance;
}
