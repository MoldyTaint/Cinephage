import { describe, it, expect } from 'vitest';
import { LibraryOperationLock } from './library-operation-lock';

describe('LibraryOperationLock', () => {
	it('starts unlocked', () => {
		const lock = new LibraryOperationLock();
		expect(lock.isLocked).toBe(false);
	});

	it('reports locked while held and unlocked after release', async () => {
		const lock = new LibraryOperationLock();
		const release = await lock.acquire('rename');
		expect(lock.isLocked).toBe(true);
		expect(lock.holder).toBe('rename');
		release();
		expect(lock.isLocked).toBe(false);
	});

	it('serializes concurrent acquirers', async () => {
		const lock = new LibraryOperationLock();
		const order: string[] = [];

		const first = lock.withLock('op-a', async () => {
			order.push('a-start');
			await new Promise((r) => setTimeout(r, 20));
			order.push('a-end');
		});
		const second = lock.withLock('op-b', async () => {
			order.push('b-start');
		});

		await Promise.all([first, second]);
		expect(order).toEqual(['a-start', 'a-end', 'b-start']);
		expect(lock.isLocked).toBe(false);
	});

	it('releases the lock when the wrapped function throws', async () => {
		const lock = new LibraryOperationLock();
		await expect(
			lock.withLock('op-a', async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(lock.isLocked).toBe(false);
	});

	it('tracks pending waiter count', async () => {
		const lock = new LibraryOperationLock();
		const release = await lock.acquire('op-a');
		const second = lock.withLock('op-b', async () => {});
		await Promise.resolve(); // let the waiter enqueue
		expect(lock.pendingCount).toBe(1);
		release();
		await second;
		expect(lock.pendingCount).toBe(0);
	});
});
