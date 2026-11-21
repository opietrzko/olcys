/**
 * Kontrolowany ruch wychodzący:
 *  - żądania API (z identyfikatorami w zapytaniu) – wyłącznie do hostów z allowlisty,
 *  - pobieranie publicznych stron (GET adresu odkrytego w dowodach) – w trybie 'public' dowolny host publiczny,
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

export type SafeFetch = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; kind?: FetchKind; timeoutMs?: number }) => Promise<FetchedResource>;

export interface EgressLogEntry {
  at: string;
  url: string;
  status: number | 'DENIED' | 'ERROR';
  ms: number;
  /** Served from an offline recording – no request left the machine. */
  replay?: boolean;
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

/** Controlled fetch for an analysis run: live, live + recording, or offline replay (see EngineConfig.recording). */
export function createSafeFetch(config: EngineConfig, log?: (e: EgressLogEntry) => void): SafeFetch {
  const rec = config.recording;
  if (rec?.mode === 'replay') return createReplayFetch(rec.dir, log);
  const live = createLiveFetch(config, log);
  return rec?.mode === 'record' ? withRecording(live, rec.dir) : live;
}

/** Recording key: method, URL and body. Headers are left out on purpose, so tokens never end up on disk. */
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
      log?.({ at: new Date().toISOString(), url, status: 'ERROR', ms: 0, replay: true });
      throw new Error(`Tryb offline: brak nagrania odpowiedzi dla ${url} (nagraj przebieg z OLCYS_RECORD_DIR)`);
    }
    const { response } = JSON.parse(readFileSync(file, 'utf8')) as Recording;
    log?.({ at: new Date().toISOString(), url, status: response.status, ms: 0, replay: true });
    return response;
  };
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
        const res = await fetch(current, {
          method: hop === 0 ? (init?.method ?? 'GET') : 'GET',
          body: hop === 0 ? init?.body : undefined,
          headers: { 'user-agent': config.userAgent, accept: '*/*', 'accept-language': 'pl,en;q=0.8', ...(init?.headers ?? {}) },
          signal: AbortSignal.timeout(init?.timeoutMs ?? config.requestTimeoutMs),
          redirect: 'manual',
        });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          current = new URL(loc, current).toString();
          continue;
        }
        let body = await res.text();
        if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
        log?.({ at: new Date().toISOString(), url, status: res.status, ms: Date.now() - t0 });
        return { url: current, status: res.status, contentType: res.headers.get('content-type') ?? 'application/octet-stream', body, fetchedAt: new Date().toISOString() };
      }
      throw new Error('Zbyt wiele przekierowań');
    } catch (e) {
      log?.({ at: new Date().toISOString(), url: current, status: e instanceof EgressDeniedError ? 'DENIED' : 'ERROR', ms: Date.now() - t0 });
      throw e;
    }
  };
}
