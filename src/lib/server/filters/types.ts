export interface StageResult {
	accepted: boolean;
	reason?: string;
	details?: Record<string, unknown>;
}

export interface DecisionStage<TContext> {
	name: string;
	isEnabled(ctx: TContext): boolean;
	evaluate(ctx: TContext): Promise<StageResult>;
}

export interface FilterStage<TItem, TContext> {
	name: string;
	isEnabled(ctx: TContext): boolean;
	apply(items: TItem[], ctx: TContext): Promise<TItem[]>;
}

export interface DecisionAuditEntry {
	name: string;
	skipped: boolean;
	result?: StageResult;
	durationMs: number;
}

export interface DecisionAudit {
	stages: DecisionAuditEntry[];
	finalResult: StageResult;
	totalDurationMs: number;
}

export interface FilterStageRun {
	stageName: string;
	before: number;
	after: number;
	removed: number;
	skipped: boolean;
}

export interface FilterContext {
	mediaType: 'movie' | 'tv' | 'all';
	excludeInLibrary?: boolean;
	skipBlockedMedia?: boolean;
}
