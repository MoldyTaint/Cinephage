import { browser } from '$app/environment';

export type ApiResponse<T = unknown> = { success: boolean; error?: string } & T;

export class ApiError extends Error {
	status: number;
	response: ApiResponse;

	constructor(message: string, status: number, response: ApiResponse) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.response = response;
	}
}

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
	if (!browser) {
		throw new Error('API client can only be used in the browser');
	}

	const res = await fetch(url, options);

	if (!res.ok) {
		let body: ApiResponse;
		try {
			body = await res.json();
		} catch {
			body = { success: false, error: res.statusText };
		}
		throw new ApiError(body.error || res.statusText, res.status, body);
	}

	return res.json() as Promise<ApiResponse<T>>;
}

export async function apiGet<T = Record<string, never>>(
	url: string,
	params?: Record<string, string>
): Promise<ApiResponse<T>> {
	const query = params ? '?' + new URLSearchParams(params).toString() : '';
	return request<T>(url + query);
}

export async function apiPost<T = Record<string, never>>(
	url: string,
	body?: unknown
): Promise<ApiResponse<T>> {
	return request<T>(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
}

export async function apiPatch<T = Record<string, never>>(
	url: string,
	body?: unknown
): Promise<ApiResponse<T>> {
	return request<T>(url, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
}

export async function apiPut<T = Record<string, never>>(
	url: string,
	body?: unknown
): Promise<ApiResponse<T>> {
	return request<T>(url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
}

export async function apiDelete<T = Record<string, never>>(
	url: string,
	body?: unknown
): Promise<ApiResponse<T>> {
	return request<T>(url, {
		method: 'DELETE',
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined
	});
}

export async function apiGetStream(
	url: string,
	params?: Record<string, string>,
	options?: RequestInit
): Promise<Response> {
	if (!browser) throw new Error('apiGetStream can only be called on client');
	const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
	const res = await fetch(`${url}${queryString}`, { ...options, method: 'GET' });
	if (!res.ok) {
		const body = await res.text();
		throw new ApiError(`Stream request failed: ${res.statusText}`, res.status, {
			success: false,
			error: body
		});
	}
	return res;
}

export async function apiPostStream(
	url: string,
	body?: unknown,
	options?: RequestInit
): Promise<Response> {
	if (!browser) throw new Error('apiPostStream can only be called on client');
	const res = await fetch(url, {
		...options,
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...options?.headers },
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const errorBody = await res.text();
		throw new ApiError(`Stream request failed: ${res.statusText}`, res.status, {
			success: false,
			error: errorBody
		});
	}
	return res;
}
