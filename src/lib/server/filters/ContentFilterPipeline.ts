import { LibraryStage } from './stages/LibraryStage.js';
import { BlockedMediaStage } from './stages/BlockedMediaStage.js';
import { composeFilterStages } from './compositor.js';
import type { FilterContext, FilterStageRun } from './types.js';

export interface ContentFilterResult<T> {
	results: T[];
	stages: FilterStageRun[];
}

export class ContentFilterPipeline {
	private stages = [new LibraryStage(), new BlockedMediaStage()];

	async apply<T extends { id: number; media_type?: string }>(
		items: T[],
		ctx: FilterContext
	): Promise<ContentFilterResult<T>> {
		return composeFilterStages(this.stages, items, ctx) as Promise<ContentFilterResult<T>>;
	}
}

export const contentFilterPipeline = new ContentFilterPipeline();
