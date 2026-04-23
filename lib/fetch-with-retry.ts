/**
 * 지수 백오프 재시도 + 타임아웃 래퍼
 * 429/5xx 에러 시 최대 3회 재시도
 */

interface FetchWithRetryOptions extends RequestInit {
  /** 전체 요청 타임아웃 (ms). 기본 10초 */
  timeout?: number;
  /** 최대 재시도 횟수. 기본 3 */
  maxRetries?: number;
  /** 재시��할 HTTP 상태 코드. 기본 [429, 500, 502, 503, 504] */
  retryOn?: number[];
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    timeout = 10_000,
    maxRetries = 3,
    retryOn = [429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok || !retryOn.includes(res.status) || attempt === maxRetries) {
        return res;
      }

      // 재시도 대기 (지수 백오프: 1s, 2s, 4s)
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 30_000) : delay;

      console.warn(`⚠️ fetchWithRetry: ${res.status} on ${url}, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await sleep(waitMs);
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;

      if (err.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${timeout}ms: ${url}`);
      }

      if (attempt === maxRetries) break;

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(`⚠️ fetchWithRetry: ${err.message}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`fetchWithRetry failed: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
