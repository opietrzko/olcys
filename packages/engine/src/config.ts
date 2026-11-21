/**
 * Konfiguracja silnika (zmienne środowiskowe). Narzędzie działa na realnych publicznych źródłach Internetu:
 * zapytania API tylko do zatwierdzonych hostów (allowlista), dane blockchain z publicznych API, kursy z NBP i CoinGecko.
 */
import { join, resolve } from 'node:path';

export interface EngineConfig {
  /** Zatwierdzone hosty API (wysyłamy do nich identyfikatory w zapytaniach). */
  egressAllowlist: string[];
  /**
   * Pobieranie publicznych stron odkrytych w dowodach (linki z profili, wyniki wyszukiwania):
   *  'public'    – dowolny publiczny host (GET bez danych analizy), z blokadą adresów prywatnych/wewnętrznych (SSRF),
   *  'allowlist' – tylko hosty z allowlisty.
   */
  webFetch: 'public' | 'allowlist';
  userAgent: string;
  requestTimeoutMs: number;
  maxDepth: number;
  /** Budżet czasu (ms) na zbieranie i pivotowanie w jednym przebiegu – po jego przekroczeniu analiza przechodzi do oceny zebranych dowodów. */
  pivotBudgetMs: number;
  /** Maks. liczba nowych tropów z jednego dokumentu (strona z nawigacją / dokumentacja to nie profil osoby). */
  maxPivotsPerDoc: number;
  /** Maks. liczba wyników wyszukiwarki pobieranych na zapytanie. */
  searchResults: number;
  urls: {
    githubApi: string;
    githubRaw: string;
    gravatarApi: string;
    keybaseApi: string;
    wayback: string;
    telegram: string;
    devtoApi: string;
    reddit: string;
    redditOauth: string;
    searxng?: string;
  };
  /** Reddit: switch (OLCYS_REDDIT=false) and the optional registered read-only app used for app-only OAuth. */
  reddit: { enabled: boolean; clientId?: string; clientSecret?: string };
  /**
   * Offline safety net for demos: record every response to a directory, or replay a recorded run without network.
   * Replay never touches the network; a request with no recording fails loudly instead of silently going online.
   */
  recording?: { mode: 'record' | 'replay'; dir: string };
  chain: {
    /** API zgodne z Etherscan: Etherscan v2 (z kluczem) lub Blockscout (bez klucza, open source, możliwy self-hosting). */
    evmApiUrl: string;
    evmApiKey?: string;
    blockscoutUrl: string;
    esploraUrl: string;
    /** Zapasowe instancje Esplora (BTC) – używane przy limicie zapytań lub awarii podstawowej. */
    esploraFallbacks: string[];
    tronGridUrl: string;
    ethRpcUrl?: string;
    liveRates: boolean;
    /**
     * Dodatkowe sieci EVM sprawdzane dla adresów 0x (ten sam adres = ten sam klucz prywatny we wszystkich sieciach EVM).
     * Wymagają klucza Etherscan v2 (jeden klucz dla wszystkich sieci) – publiczne instancje Blockscout dla L2 blokują ruch automatyczny.
     */
    evmNetworks: string[];
  };
  labelsDir: string;
  /** Token GitHub (tylko odczyt danych publicznych) – podnosi limit API z 60 do 5000 zapytań/h. */
  githubToken?: string;
  llm?: { baseUrl: string; model: string; apiKey?: string };
}

export const ENGINE_VERSION = 'olcys-engine/0.3.0';
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Zatwierdzone publiczne źródła trybu LIVE (do których trafiają identyfikatory w zapytaniach API). */
export const DEFAULT_LIVE_SOURCES = [
  'api.github.com',
  'raw.githubusercontent.com',
  'api.gravatar.com',
  'keybase.io',
  'web.archive.org',
  't.me',
  'dev.to',
  'www.reddit.com',
  'oauth.reddit.com',
  'eth.blockscout.com',
  'ethereum-rpc.publicnode.com',
  'blockstream.info',
  'mempool.space',
  'api.trongrid.io',
  'api.coingecko.com',
  'api.nbp.pl',
];

const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).host : undefined;
  } catch {
    return undefined;
  }
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const searxng = env.SEARXNG_URL?.replace(/\/$/, '') || undefined;
  const evmApiKey = env.ETHERSCAN_API_KEY || undefined;
  const blockscoutUrl = env.BLOCKSCOUT_URL ?? 'https://eth.blockscout.com';
  const evmApiUrl = env.EVM_API_URL ?? (evmApiKey ? 'https://api.etherscan.io/v2/api' : `${blockscoutUrl}/api`);
  const ethRpcUrl = env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
  const allow = [...DEFAULT_LIVE_SOURCES, ...list(env.EGRESS_ALLOWLIST), hostOf(searxng), hostOf(evmApiUrl), hostOf(ethRpcUrl), hostOf(env.ESPLORA_URL), ...list(env.ESPLORA_FALLBACK_URLS).map(hostOf), hostOf(env.LLM_BASE_URL)].filter(Boolean) as string[];
  return {
    egressAllowlist: [...new Set(allow)],
    webFetch: env.OLCYS_WEB_FETCH === 'allowlist' ? 'allowlist' : 'public',
    userAgent: env.OLCYS_USER_AGENT ?? 'KryptoTrop-OSINT/0.3 (+analiza danych publicznych)',
    requestTimeoutMs: Number(env.OLCYS_TIMEOUT_MS ?? 15000),
    maxDepth: Number(env.OLCYS_MAX_DEPTH ?? 6),
    pivotBudgetMs: Number(env.OLCYS_PIVOT_BUDGET_MS ?? 180_000),
    maxPivotsPerDoc: Number(env.OLCYS_MAX_PIVOTS_PER_DOC ?? 12),
    searchResults: Number(env.OLCYS_SEARCH_RESULTS ?? 8),
    urls: {
      githubApi: env.GITHUB_API_URL ?? 'https://api.github.com',
      githubRaw: env.GITHUB_RAW_URL ?? 'https://raw.githubusercontent.com',
      gravatarApi: env.GRAVATAR_API_URL ?? 'https://api.gravatar.com/v3',
      keybaseApi: env.KEYBASE_API_URL ?? 'https://keybase.io/_/api/1.0',
      wayback: env.WAYBACK_URL ?? 'https://web.archive.org',
      telegram: env.TELEGRAM_PREVIEW_URL ?? 'https://t.me',
      devtoApi: env.DEVTO_API_URL ?? 'https://dev.to/api',
      reddit: env.REDDIT_URL ?? 'https://www.reddit.com',
      redditOauth: env.REDDIT_OAUTH_URL ?? 'https://oauth.reddit.com',
      searxng,
    },
    reddit: { enabled: env.OLCYS_REDDIT !== 'false', clientId: env.REDDIT_CLIENT_ID || undefined, clientSecret: env.REDDIT_CLIENT_SECRET || undefined },
    recording: env.OLCYS_REPLAY_DIR
      ? { mode: 'replay', dir: resolve(env.OLCYS_REPLAY_DIR) }
      : env.OLCYS_RECORD_DIR
        ? { mode: 'record', dir: resolve(env.OLCYS_RECORD_DIR) }
        : undefined,
    chain: {
      evmApiUrl,
      evmApiKey,
      blockscoutUrl,
      esploraUrl: env.ESPLORA_URL ?? 'https://blockstream.info/api',
      esploraFallbacks: env.ESPLORA_FALLBACK_URLS !== undefined ? list(env.ESPLORA_FALLBACK_URLS) : ['https://mempool.space/api'],
      tronGridUrl: env.TRONGRID_URL ?? 'https://api.trongrid.io',
      ethRpcUrl,
      liveRates: env.OLCYS_LIVE_RATES !== 'false',
      evmNetworks: evmApiKey ? (env.EVM_NETWORKS !== undefined ? list(env.EVM_NETWORKS) : ['polygon', 'arbitrum']) : [],
    },
    labelsDir: env.LABELS_DIR ?? join(REPO_ROOT, 'data', 'labels'),
    githubToken: env.GITHUB_TOKEN || undefined,
    llm: env.LLM_BASE_URL ? { baseUrl: env.LLM_BASE_URL.replace(/\/$/, ''), model: env.LLM_MODEL ?? 'llama3.1', apiKey: env.LLM_API_KEY } : undefined,
  };
}

/** Niezależna „rodzina źródeł” = domena (bez www). */
export function familyOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}
