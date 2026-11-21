/**
 * Konfiguracja silnika (zmienne środowiskowe). Domyślnie tryb DEMO: wszystkie konektory wskazują na
 * syntetyczny mini-internet, dane blockchain pochodzą z fixtures, ruch wychodzący ograniczony do allowlisty.
 */
import { join, resolve } from 'node:path';

export type EngineMode = 'demo' | 'live';

export interface EngineConfig {
  mode: EngineMode;
  mockWebUrl: string;
  egressAllowlist: string[];
  userAgent: string;
  requestTimeoutMs: number;
  maxDepth: number;
  urls: {
    githubApi: string;
    githubRaw: string;
    gravatarApi: string;
    wayback: string;
    telegram: string;
    forum?: string;
    p2p?: string;
  };
  chain: {
    provider: 'fixture' | 'live';
    fixturesDir: string;
    ratesFile: string;
    etherscanUrl: string;
    etherscanApiKey?: string;
    esploraUrl: string;
    tronGridUrl: string;
    ethRpcUrl?: string;
  };
  labelsDir: string;
  llm?: { baseUrl: string; model: string; apiKey?: string };
}

export const ENGINE_VERSION = 'olcys-engine/0.1.0';
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const mode: EngineMode = env.OLCYS_MODE === 'live' ? 'live' : 'demo';
  const mock = (env.MOCK_WEB_URL ?? 'http://localhost:4100').replace(/\/$/, '');
  const mockHost = new URL(mock).host;
  const demo = mode === 'demo';
  return {
    mode,
    mockWebUrl: mock,
    egressAllowlist: [...new Set([mockHost, 'localhost', '127.0.0.1', ...list(env.EGRESS_ALLOWLIST)])],
    userAgent: env.OLCYS_USER_AGENT ?? 'OLCyS-OSINT/0.1 (+analiza danych publicznych)',
    requestTimeoutMs: Number(env.OLCYS_TIMEOUT_MS ?? 10000),
    maxDepth: Number(env.OLCYS_MAX_DEPTH ?? 2),
    urls: {
      githubApi: env.GITHUB_API_URL ?? (demo ? `${mock}/github/api` : 'https://api.github.com'),
      githubRaw: env.GITHUB_RAW_URL ?? (demo ? `${mock}/github/raw` : 'https://raw.githubusercontent.com'),
      gravatarApi: env.GRAVATAR_API_URL ?? (demo ? `${mock}/gravatar/v3` : 'https://api.gravatar.com/v3'),
      wayback: env.WAYBACK_URL ?? (demo ? `${mock}/archive` : 'https://web.archive.org'),
      telegram: env.TELEGRAM_PREVIEW_URL ?? (demo ? `${mock}/tg` : 'https://t.me'),
      forum: env.FORUM_URL ?? (demo ? `${mock}/forum` : undefined),
      p2p: env.P2P_URL ?? (demo ? `${mock}/p2p` : undefined),
    },
    chain: {
      provider: env.CHAIN_PROVIDER === 'live' ? 'live' : 'fixture',
      fixturesDir: env.FIXTURES_DIR ?? join(REPO_ROOT, 'fixtures', 'chain'),
      ratesFile: env.RATES_FILE ?? join(REPO_ROOT, 'fixtures', 'rates.json'),
      etherscanUrl: env.ETHERSCAN_URL ?? 'https://api.etherscan.io/v2/api',
      etherscanApiKey: env.ETHERSCAN_API_KEY,
      esploraUrl: env.ESPLORA_URL ?? 'https://mempool.space/api',
      tronGridUrl: env.TRONGRID_URL ?? 'https://api.trongrid.io',
      ethRpcUrl: env.ETH_RPC_URL,
    },
    labelsDir: env.LABELS_DIR ?? join(REPO_ROOT, 'data', 'labels'),
    llm: env.LLM_BASE_URL ? { baseUrl: env.LLM_BASE_URL.replace(/\/$/, ''), model: env.LLM_MODEL ?? 'llama3.1', apiKey: env.LLM_API_KEY } : undefined,
  };
}

/** Niezależna „rodzina źródeł” dla URL – w trybie demo rozróżniamy serwisy po pierwszym segmencie ścieżki. */
export function familyOf(url: string, config: EngineConfig): string {
  try {
    const u = new URL(url);
    if (url.startsWith(config.mockWebUrl)) return `mock:${u.pathname.split('/')[1] || 'root'}`;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}
