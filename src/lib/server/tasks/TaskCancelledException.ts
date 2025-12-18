/**
 * Exception thrown when a task is cancelled.
 * This allows distinguishing cancellation from other errors.
 */
export class TaskCancelledException extends Error {
	readonly taskId: string;

	constructor(taskId: string) {
		super(`Task '${taskId}' was cancelled`);
		this.name = 'TaskCancelledException';
		this.taskId = taskId;
	}

	/**
	 * Check if an error is a TaskCancelledException
	 */
	static isTaskCancelled(error: unknown): error is TaskCancelledException {
		return error instanceof TaskCancelledException;
	}
}
