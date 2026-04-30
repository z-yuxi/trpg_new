import { ElMessage } from 'element-plus';

type AppError = Error & {
  status?: number;
  error_code?: string;
};

const GENERIC_MESSAGES = new Set([
  'failed to fetch',
  'network error',
  'network request failed',
  'internal server error',
]);

function isNetworkError(error: unknown): boolean {
  const err = error as AppError | undefined;
  const message = (err?.message ?? '').toLowerCase();
  if (err?.status === 0) {
    return true;
  }
  if (err?.status === 408 || err?.status === 502 || err?.status === 503 || err?.status === 504) {
    return true;
  }
  return message.includes('failed to fetch') || message.includes('network');
}

export function getUserFacingErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  if (isNetworkError(error)) {
    return '网络连接失败，请重试';
  }

  const err = error as AppError | undefined;
  const raw = (err?.message ?? '').trim();
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (GENERIC_MESSAGES.has(normalized)) {
    return fallback;
  }

  return raw;
}

export function showApiError(error: unknown, fallback = '操作失败，请重试'): void {
  ElMessage.error(getUserFacingErrorMessage(error, fallback));
}
