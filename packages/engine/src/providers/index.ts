/**
 * Dostawcy danych blockchain: Etherscan (API v2, wiele sieci EVM), Esplora (BTC – możliwy self-hosting, np. mempool.space), TronGrid.
 * Interfejs pozwala podmienić źródło na węzeł własny KAS bez zmian w logice analizy.
 */
import { addressKey, toChecksumAddress, type Chain, type Transfer } from '@olcys/core';
import type { EngineConfig } from '../config';
import type { SafeFetch } from '../http';

export interface ChainProvider {
  id: string;
  supports(chain: Chain): boolean;
  /** null = brak danych / błąd dostawcy (adres niezweryfikowany). */
  getTransfers(chain: Chain, address: string): Promise<Transfer[] | null>;
  /** Bytecode adresu (EVM). null = nie sprawdzono. */
  getCode(chain: Chain, address: string): Promise<string | null>;
  /** Powód ostatniego niepowodzenia (np. limit zapytań) – trafia do przebiegu analizy zamiast cichego „brak danych”. */
  lastError?: string;
  /** Etykieta / nazwa adresu z API eksploratora (KROK 3.1 załącznika). */
  getInfo?(chain: Chain, address: string): Promise<AddressInfo | null>;
  explorerUrl(chain: Chain, address: string): string | undefined;
}

export interface AddressInfo {
  isContract?: boolean;
  name?: string;
  tags: string[];
  source: string;
}

const EXPLORERS: Partial<Record<Chain, (a: string) => string>> = {
  ETH: (a) => `https://etherscan.io/address/${a}`,
  BTC: (a) => `https://mempool.space/address/${a}`,
  TRON: (a) => `https://tronscan.org/#/address/${a}`,
  LTC: (a) => `https://litecoinspace.org/address/${a}`,
  SOL: (a) => `https://solscan.io/account/${a}`,
};
const explorer = (chain: Chain, a: string) => EXPLORERS[chain]?.(a);

/** API zgodne z Etherscan: Etherscan v2 (z kluczem) albo Blockscout (open source, bez klucza, możliwy self-hosting w KAS). */
export class EtherscanProvider implements ChainProvider {
  id: string;
  constructor(private cfg: EngineConfig, private fetch: SafeFetch, private chainId = 1) {
    this.id = cfg.chain.evmApiKey ? 'etherscan-v2' : `blockscout (${new URL(cfg.chain.evmApiUrl).host})`;
  }
  supports(chain: Chain) {
    return chain === 'ETH';
  }
  lastError?: string;
  /** Zapytanie z ponowieniem przy limicie (HTTP 429 / „Too many requests” / „rate limit”): 2 próby, odstęp 1,5 s i 3 s. */
  private async q(params: Record<string, string>) {
    const u = new URL(this.cfg.chain.evmApiUrl);
    const extra: Record<string, string> = this.cfg.chain.evmApiKey ? { chainid: String(this.chainId), apikey: this.cfg.chain.evmApiKey } : {};
    for (const [k, v] of Object.entries({ ...params, ...extra })) u.searchParams.set(k, v);
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetch(u.toString());
      let body: { message?: string; result?: unknown } = {};
      try {
        body = JSON.parse(r.body);
      } catch {
        /* odpowiedź nie-JSON – traktujemy jak błąd poniżej */
      }
      const limited = r.status === 429 || /too many requests|rate limit/i.test(`${body.message ?? ''} ${typeof body.result === 'string' ? body.result : ''}`);
      if (!limited) return body as { message?: string; result?: unknown } & Record<string, unknown>;
      if (attempt >= 2) throw new Error(`${this.id}: przekroczony limit zapytań (ustaw ETHERSCAN_API_KEY lub użyj własnej instancji Blockscout)`);
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      this.lastError = undefined;
      // po kolei, nie równolegle – publiczne API mają niskie limity zapytań na sekundę
      const native = (await this.q({ module: 'account', action: 'txlist', address, sort: 'asc', page: '1', offset: '1000' })) as { result?: any };
      const tokens = (await this.q({ module: 'account', action: 'tokentx', address, sort: 'asc', page: '1', offset: '1000' })) as { result?: any };
      const out: Transfer[] = [];
      for (const t of Array.isArray(native.result) ? native.result : []) {
        if (t.isError === '1') continue;
        if (!t.to) continue;
        out.push({ chain, hash: t.hash, timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(), from: toChecksumAddress(t.from), to: toChecksumAddress(t.to), asset: 'ETH', amount: Number(t.value) / 1e18, method: t.functionName?.split('(')[0] || (t.methodId && t.methodId !== '0x' ? t.methodId : undefined) });
      }
      for (const t of Array.isArray(tokens.result) ? tokens.result : []) {
        out.push({ chain, hash: t.hash, timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(), from: toChecksumAddress(t.from), to: toChecksumAddress(t.to), asset: t.tokenSymbol, amount: Number(t.value) / 10 ** Number(t.tokenDecimal || 18), tokenContract: toChecksumAddress(t.contractAddress), method: t.functionName?.split('(')[0] || undefined });
      }
      if (!Array.isArray(native.result) && !Array.isArray(tokens.result)) return null;
      return out;
    } catch (e) {
      this.lastError = (e as Error).message;
      return null;
    }
  }
  async getCode(_chain: Chain, address: string) {
    const rpc = this.cfg.chain.ethRpcUrl;
    try {
      if (rpc) {
        const r = await this.fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }) });
        const code = JSON.parse(r.body).result;
        return typeof code === 'string' ? code : null;
      }
      const r = await this.q({ module: 'proxy', action: 'eth_getCode', address, tag: 'latest' });
      return typeof r.result === 'string' ? r.result : null;
    } catch {
      return null;
    }
  }
  /** Blockscout v2: nazwa zweryfikowanego kontraktu, publiczne tagi (np. „Binance”, „Exchange”). */
  async getInfo(_chain: Chain, address: string): Promise<AddressInfo | null> {
    try {
      const r = await this.fetch(`${this.cfg.chain.blockscoutUrl}/api/v2/addresses/${address}`, { headers: { accept: 'application/json' }, timeoutMs: 8000 });
      if (r.status !== 200) return null;
      const d = JSON.parse(r.body) as { is_contract?: boolean; name?: string | null; public_tags?: { display_name?: string; label?: string }[]; metadata?: { tags?: { name?: string; tagType?: string }[] } | null };
      const tags = [...(d.public_tags ?? []).map((t) => t.display_name ?? t.label ?? ''), ...(d.metadata?.tags ?? []).map((t) => t.name ?? '')].filter(Boolean);
      return { isContract: d.is_contract, name: d.name ?? undefined, tags, source: `Blockscout ${new URL(this.cfg.chain.blockscoutUrl).host}` };
    } catch {
      return null;
    }
  }
  explorerUrl = explorer;
}

export class EsploraProvider implements ChainProvider {
  id = 'esplora';
  constructor(private cfg: EngineConfig, private fetch: SafeFetch) {}
  supports(chain: Chain) {
    return chain === 'BTC';
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      type EsTx = { txid: string; status: { confirmed?: boolean; block_time?: number }; vin: { prevout?: { scriptpubkey_address?: string; value: number } }[]; vout: { scriptpubkey_address?: string; value: number }[] };
      const r = await this.fetch(`${this.cfg.chain.esploraUrl}/address/${address}/txs`);
      if (r.status !== 200) return null;
      const txs = JSON.parse(r.body) as EsTx[];
      // stronicowanie historii potwierdzonych transakcji (po 25), maks. 4 strony
      for (let page = 0; page < 3 && txs.length >= 25 * (page + 1); page++) {
        const last = [...txs].reverse().find((t) => t.status.confirmed !== false);
        if (!last) break;
        const n = await this.fetch(`${this.cfg.chain.esploraUrl}/address/${address}/txs/chain/${last.txid}`);
        if (n.status !== 200) break;
        const more = JSON.parse(n.body) as EsTx[];
        if (!more.length) break;
        txs.push(...more);
      }
      const out: Transfer[] = [];
      for (const tx of txs) {
        const ts = new Date((tx.status.block_time ?? Date.now() / 1000) * 1000).toISOString();
        const isOut = tx.vin.some((v) => v.prevout?.scriptpubkey_address === address);
        if (isOut) {
          for (const o of tx.vout) if (o.scriptpubkey_address && o.scriptpubkey_address !== address) out.push({ chain, hash: tx.txid, timestamp: ts, from: address, to: o.scriptpubkey_address, asset: 'BTC', amount: o.value / 1e8 });
        } else {
          const amount = tx.vout.filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + o.value, 0) / 1e8;
          out.push({ chain, hash: tx.txid, timestamp: ts, from: tx.vin[0]?.prevout?.scriptpubkey_address ?? 'coinbase', to: address, asset: 'BTC', amount });
        }
      }
      return out;
    } catch {
      return null;
    }
  }
  async getCode() {
    return null;
  }
  explorerUrl = explorer;
}

export class TronGridProvider implements ChainProvider {
  id = 'trongrid';
  constructor(private cfg: EngineConfig, private fetch: SafeFetch) {}
  supports(chain: Chain) {
    return chain === 'TRON';
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      const r = await this.fetch(`${this.cfg.chain.tronGridUrl}/v1/accounts/${address}/transactions/trc20?limit=200`);
      if (r.status !== 200) return null;
      const data = JSON.parse(r.body).data as { transaction_id: string; block_timestamp: number; from: string; to: string; value: string; token_info: { symbol: string; decimals: number; address: string } }[];
      return data.map((t) => ({ chain, hash: t.transaction_id, timestamp: new Date(t.block_timestamp).toISOString(), from: t.from, to: t.to, asset: t.token_info.symbol, amount: Number(t.value) / 10 ** t.token_info.decimals, tokenContract: t.token_info.address }));
    } catch {
      return null;
    }
  }
  async getCode() {
    return null;
  }
  explorerUrl = explorer;
}

/** Wybiera pierwszego dostawcę obsługującego sieć. */
export class CompositeProvider implements ChainProvider {
  id: string;
  constructor(private providers: ChainProvider[]) {
    this.id = providers.map((p) => p.id).join(' + ');
  }
  private pick(chain: Chain) {
    return this.providers.find((p) => p.supports(chain));
  }
  supports(chain: Chain) {
    return Boolean(this.pick(chain));
  }
  async getTransfers(chain: Chain, address: string) {
    return (await this.pick(chain)?.getTransfers(chain, address)) ?? null;
  }
  async getCode(chain: Chain, address: string) {
    return (await this.pick(chain)?.getCode(chain, address)) ?? null;
  }
  async getInfo(chain: Chain, address: string) {
    return (await this.pick(chain)?.getInfo?.(chain, address)) ?? null;
  }
  explorerUrl = explorer;
  /** Powód braku danych od dostawcy dla danej sieci (jeśli znany). */
  errorFor(chain: Chain) {
    return this.pick(chain)?.lastError;
  }
  sourceFor(chain: Chain) {
    return this.pick(chain)?.id ?? 'brak dostawcy';
  }
}

export function createChainProvider(cfg: EngineConfig, fetch: SafeFetch): CompositeProvider {
  return new CompositeProvider([new EtherscanProvider(cfg, fetch), new EsploraProvider(cfg, fetch), new TronGridProvider(cfg, fetch)]);
}
