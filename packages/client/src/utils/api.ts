const BASE = '/api';

/** 读取当前登录 access token */
export function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

/** 保存 refresh token */
export function setRefreshToken(token: string): void {
  localStorage.setItem('refresh_token', token);
}

/** 清除全部 auth 存储（refresh 失败时调用） */
export function clearAuth(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Token Refresh（防止并发多次 refresh）──────────────────────────────────
let _refreshPromise: Promise<string> | null = null;

async function tryRefreshToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token stored');
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearAuth();
      throw new Error('Refresh token expired');
    }
    const data = await res.json();
    const newAccessToken: string = data?.tokens?.access_token ?? data?.access_token ?? '';
    const newRefreshToken: string = data?.tokens?.refresh_token ?? '';
    if (!newAccessToken) throw new Error('Refresh response missing access_token');
    localStorage.setItem('token', newAccessToken);
    if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);
    return newAccessToken;
  })().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

/**
 * 带 auth 头的 fetch，遇 401 时自动尝试 refresh 并重试一次。
 * refresh 失败则清除 auth 并跳转 /login。
 */
async function fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) } });
  if (res.status !== 401) return res;
  // 尝试刷新 token
  try {
    await tryRefreshToken();
  } catch {
    // refresh 失败 → 跳转登录页
    window.location.href = '/login';
    // 返回原始 401 response 让调用方处理（实际上页面即将刷新）
    return res;
  }
  // 用新 token 重试原请求
  return fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) } });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    let errorCode: string | undefined;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? message;
      errorCode = body.error_code;
    } catch {
      // ignore parse error
    }
    const err = new Error(message) as Error & { status?: number; error_code?: string };
    err.status = res.status;
    err.error_code = errorCode;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get<T = unknown>(path: string): Promise<T> {
    return fetchWithAuth(`${BASE}${path}`, {}).then((res) => handleResponse<T>(res));
  },

  /**
   * POST 请求。传入 idempotencyKey 时自动附加 X-Idempotency-Key 请求头，
   * 服务端会缓存成功响应，重复提交返回相同结果（防止双击/网络重试副作用）。
   */
  post<T = unknown>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const extraHeaders: Record<string, string> = {};
    if (idempotencyKey) extraHeaders['X-Idempotency-Key'] = idempotencyKey;
    return fetchWithAuth(`${BASE}${path}`, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: extraHeaders,
    }).then((res) => handleResponse<T>(res));
  },

  put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return fetchWithAuth(`${BASE}${path}`, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((res) => handleResponse<T>(res));
  },

  delete<T = unknown>(path: string): Promise<T> {
    return fetchWithAuth(`${BASE}${path}`, {
      method: 'DELETE',
    }).then((res) => handleResponse<T>(res));
  },

  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return fetchWithAuth(`${BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((res) => handleResponse<T>(res));
  },
};
