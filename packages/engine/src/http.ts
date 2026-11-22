/**
 * Kontrolowany ruch wychodzący:
 *  - żądania API (z identyfikatorami w zapytaniu) - wyłącznie do hostów z allowlisty,
 *  - pobieranie publicznych stron (GET adresu odkrytego w dowodach) - w trybie 'public' dowolny host publiczny,
 *    z blokadą adresów prywatnych / pętli zwrotnej / link-local (ochrona przed SSRF w sieci wewnętrznej KAS),
 *  - limit czasu, identyfikowalny User-Agent, limit rozmiaru odpowiedzi, log każdego żądania w przebiegu analizy.
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { EngineConfig } from './config';

export class EgressDeniedError extends Error {
  constructor(public host: string, reason = 'nie znajduje się na liście zatwierdzonych źródeł (EGRESS_ALLOWLIST)') {
    super(`Host ${host} ${reason}`);
  }
}

export interface FetchedResource {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
}

export type FetchKind = 'api' | 'page';

/** `binary: true` - treść odpowiedzi (np. obraz) zwracana w base64 zamiast jako tekst. */
export type SafeFetch = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; kind?: FetchKind; timeoutMs?: number; binary?: boolean }) => Promise<FetchedResource>;

export interface EgressLogEntry {
  at: string;
  url: string;
  status: number | 'DENIED' | 'ERROR';
  ms: number;
  /** Odpowiedź z nagrania offline - żadne zapytanie nie wyszło z maszyny. */
  replay?: boolean;
  kind: FetchKind;
}

const MAX_BODY = 3_000_000;

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) throw new EgressDeniedError(h, 'jest adresem wewnętrznym (ochrona SSRF)');
  const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new EgressDeniedError(h, 'wskazuje na adres prywatny/wewnętrzny (ochrona SSRF)');
}

/** Kontrolowany fetch przebiegu: na żywo, na żywo z nagrywaniem albo odtwarzanie offline (EngineConfig.recording). */
export function createSafeFetch(config: EngineConfig, log?: (e: EgressLogEntry) => void): SafeFetch {
  const rec = config.recording;
  if (rec?.mode === 'replay') return createReplayFetch(rec.dir, log);
  const live = createLiveFetch(config, log);
  return rec?.mode === 'record' ? withRecording(live, rec.dir) : live;
}

/** Klucz nagrania: metoda, URL i body. Bez nagłówków, żeby tokeny nie trafiały na dysk. */
export function recordingKey(url: string, init?: { method?: string; body?: string }): string {
  return createHash('sha256')
    .update(`${init?.method ?? 'GET'} ${url}\n${init?.body ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

interface Recording {
  request: { method: string; url: string };
  response: FetchedResource;
}

function withRecording(live: SafeFetch, dir: string): SafeFetch {
  mkdirSync(dir, { recursive: true });
  return async (url, init) => {
    const res = await live(url, init);
    // Never persist OAuth token responses: replay skips token requests altogether.
    if (/\/access_token\b|\/oauth\/token\b/.test(url)) return res;
    const rec: Recording = { request: { method: init?.method ?? 'GET', url }, response: res };
    writeFileSync(join(dir, `${recordingKey(url, init)}.json`), JSON.stringify(rec));
    return res;
  };
}

function createReplayFetch(dir: string, log?: (e: EgressLogEntry) => void): SafeFetch {
  return async (url, init) => {
    const file = join(dir, `${recordingKey(url, init)}.json`);
    if (!existsSync(file)) {
      log?.({ at: new Date().toISOString(), url, status: 'ERROR', ms: 0, replay: true, kind: init?.kind ?? 'api' });
      throw new Error(`Tryb offline: brak nagrania odpowiedzi dla ${url} (nagraj przebieg z OLCYS_RECORD_DIR)`);
    }
    const { response } = JSON.parse(readFileSync(file, 'utf8')) as Recording;
    log?.({ at: new Date().toISOString(), url, status: response.status, ms: 0, replay: true, kind: init?.kind ?? 'api' });
    return response;
  };
}

/** Opóźnienia przed ponowieniem zapytania po przejściowym błędzie (zerwane połączenie, DNS, 502/503/504). */
export const RETRY_DELAYS_MS = [400, 1200];

/** Ponawia GET po przejściowym błędzie połączenia. 429 i inne błędy HTTP zwraca bez ponawiania. */
export async function withRetry(method: string, run: () => Promise<Response>, delays: number[] = RETRY_DELAYS_MS): Promise<Response> {
  const retryable = method.toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    const last = !retryable || attempt >= delays.length;
    try {
      const res = await run();
      if (last || ![502, 503, 504].includes(res.status)) return res;
    } catch (e) {
      if (last || (e as Error).name === 'TimeoutError') throw e;
    }
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}

function createLiveFetch(config: EngineConfig, log?: (e: EgressLogEntry) => void): SafeFetch {
  const allowed = new Set(config.egressAllowlist.map((h) => h.toLowerCase()));
  const isAllowed = (u: URL) => allowed.has(u.host.toLowerCase()) || allowed.has(u.hostname.toLowerCase());
  const check = async (u: URL, kind: FetchKind) => {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new EgressDeniedError(u.host, `– niedozwolony protokół ${u.protocol}`);
    if (isAllowed(u)) return;
    if (kind !== 'page' || config.webFetch !== 'public') throw new EgressDeniedError(u.host);
    try {
      await assertPublicHost(u.hostname);
    } catch (e) {
      throw e instanceof EgressDeniedError ? e : new EgressDeniedError(u.host, `– nie można rozwiązać nazwy (${(e as Error).message})`);
    }
  };
  return async (url, init) => {
    const kind = init?.kind ?? 'api';
    const t0 = Date.now();
    let current = url;
    try {
      // przekierowania obsługiwane ręcznie: każdy przeskok przechodzi kontrolę ZANIM zostanie wykonany
      for (let hop = 0; hop <= 5; hop++) {
        await check(new URL(current), kind);
        const method = hop === 0 ? (init?.method ?? 'GET') : 'GET';
        const res = await withRetry(method, () =>
          fetch(current, {
            method,
            body: hop === 0 ? init?.body : undefined,
            headers: { 'user-agent': config.userAgent, accept: '*/*', 'accept-language': 'pl,en;q=0.8', ...(init?.headers ?? {}) },
            signal: AbortSignal.timeout(init?.timeoutMs ?? config.requestTimeoutMs),
            redirect: 'manual',
          }),
        );
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          current = new URL(loc, current).toString();
          continue;
        }
        let body: string;
        if (init?.binary) {
          const buf = Buffer.from(await res.arrayBuffer());
          // obraz ucięty w połowie jest bezużyteczny - zbyt duży plik zwracamy pusty
          body = buf.length > MAX_BODY ? '' : buf.toString('base64');
        } else {
          body = await res.text();
          if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
        }
        log?.({ at: new Date().toISOString(), url, status: res.status, ms: Date.now() - t0, kind });
        return { url: current, status: res.status, contentType: res.headers.get('content-type') ?? 'application/octet-stream', body, fetchedAt: new Date().toISOString() };
      }
      throw new Error('Zbyt wiele przekierowań');
    } catch (e) {
      log?.({ at: new Date().toISOString(), url: current, status: e instanceof EgressDeniedError ? 'DENIED' : 'ERROR', ms: Date.now() - t0, kind });
      throw e;
    }
  };
}
