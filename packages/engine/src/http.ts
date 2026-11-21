/**
 * Kontrolowany ruch wychodzący: każde żądanie przechodzi przez allowlistę hostów (wymóg: brak wysyłania danych
 * do niezatwierdzonych usług), ma limit czasu, identyfikowalny User-Agent i jest logowane w przebiegu analizy.
 */
import type { EngineConfig } from './config';

export class EgressDeniedError extends Error {
  constructor(public host: string) {
    super(`Host ${host} nie znajduje się na liście zatwierdzonych źródeł (EGRESS_ALLOWLIST)`);
  }
}

export interface FetchedResource {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
}

export type SafeFetch = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<FetchedResource>;

export interface EgressLogEntry {
  at: string;
  url: string;
  status: number | 'DENIED' | 'ERROR';
  ms: number;
}

export function createSafeFetch(config: EngineConfig, log?: (e: EgressLogEntry) => void): SafeFetch {
  const allowed = new Set(config.egressAllowlist.map((h) => h.toLowerCase()));
  return async (url, init) => {
    const u = new URL(url);
    const t0 = Date.now();
    if (!allowed.has(u.host.toLowerCase()) && !allowed.has(u.hostname.toLowerCase())) {
      log?.({ at: new Date().toISOString(), url, status: 'DENIED', ms: 0 });
      throw new EgressDeniedError(u.host);
    }
    try {
      const res = await fetch(url, {
        method: init?.method ?? 'GET',
        body: init?.body,
        headers: { 'user-agent': config.userAgent, accept: '*/*', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
        redirect: 'follow',
      });
      const body = await res.text();
      log?.({ at: new Date().toISOString(), url, status: res.status, ms: Date.now() - t0 });
      return { url: res.url || url, status: res.status, contentType: res.headers.get('content-type') ?? 'application/octet-stream', body, fetchedAt: new Date().toISOString() };
    } catch (e) {
      log?.({ at: new Date().toISOString(), url, status: 'ERROR', ms: Date.now() - t0 });
      throw e;
    }
  };
}
