/**
 * Dostawcy danych blockchain. FixtureProvider = dane syntetyczne (demo, testy, praca offline);
 * Etherscan (API v2, wiele sieci EVM), Esplora (BTC – możliwy self-hosting, np. mempool.space), TronGrid.
 * Interfejs pozwala podmienić źródło na węzeł własny KAS bez zmian w logice analizy.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
  explorerUrl(chain: Chain, address: string): string | undefined;
}

const EXPLORERS: Partial<Record<Chain, (a: string) => string>> = {
  ETH: (a) => `https://etherscan.io/address/${a}`,
  BTC: (a) => `https://mempool.space/address/${a}`,
  TRON: (a) => `https://tronscan.org/#/address/${a}`,
  LTC: (a) => `https://litecoinspace.org/address/${a}`,
  SOL: (a) => `https://solscan.io/account/${a}`,
};
const explorer = (chain: Chain, a: string) => EXPLORERS[chain]?.(a);

interface FixtureFile {
  chain: Chain;
  address: string;
  code?: string;
  transfers: Transfer[];
}

export class FixtureProvider implements ChainProvider {
  id = 'fixtures (dane syntetyczne)';
  private index = new Map<string, FixtureFile>();
  constructor(dir: string) {
    if (!existsSync(dir)) return;
    for (const chain of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, chain))) {
        const data = JSON.parse(readFileSync(join(dir, chain, f), 'utf8')) as FixtureFile;
        data.transfers = data.transfers.map((t) => ({ ...t, chain: data.chain }));
        this.index.set(addressKey(data.chain, data.address), data);
      }
    }
  }
  supports() {
    return true;
  }
  async getTransfers(chain: Chain, address: string) {
    return this.index.get(addressKey(chain, address))?.transfers ?? null;
  }
  async getCode(chain: Chain, address: string) {
    if (chain !== 'ETH') return null;
    return this.index.get(addressKey(chain, address))?.code ?? null;
  }
  explorerUrl = explorer;
}

export class EtherscanProvider implements ChainProvider {
  id = 'etherscan-v2';
  constructor(private cfg: EngineConfig, private fetch: SafeFetch, private chainId = 1) {}
  supports(chain: Chain) {
    return chain === 'ETH' && Boolean(this.cfg.chain.etherscanApiKey);
  }
  private async q(params: Record<string, string>) {
    const u = new URL(this.cfg.chain.etherscanUrl);
    for (const [k, v] of Object.entries({ chainid: String(this.chainId), ...params, apikey: this.cfg.chain.etherscanApiKey ?? '' })) u.searchParams.set(k, v);
    const r = await this.fetch(u.toString());
    return JSON.parse(r.body);
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      const [native, tokens] = await Promise.all([
        this.q({ module: 'account', action: 'txlist', address, sort: 'asc', page: '1', offset: '1000' }),
        this.q({ module: 'account', action: 'tokentx', address, sort: 'asc', page: '1', offset: '1000' }),
      ]);
      const out: Transfer[] = [];
      for (const t of Array.isArray(native.result) ? native.result : []) {
        if (t.isError === '1') continue;
        out.push({ chain, hash: t.hash, timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(), from: toChecksumAddress(t.from), to: t.to ? toChecksumAddress(t.to) : '', asset: 'ETH', amount: Number(t.value) / 1e18, method: t.functionName?.split('(')[0] || undefined });
      }
      for (const t of Array.isArray(tokens.result) ? tokens.result : []) {
        out.push({ chain, hash: t.hash, timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(), from: toChecksumAddress(t.from), to: toChecksumAddress(t.to), asset: t.tokenSymbol, amount: Number(t.value) / 10 ** Number(t.tokenDecimal), tokenContract: toChecksumAddress(t.contractAddress), method: t.functionName?.split('(')[0] || undefined });
      }
      return out;
    } catch {
      return null;
    }
  }
  async getCode(_chain: Chain, address: string) {
    try {
      const r = await this.q({ module: 'proxy', action: 'eth_getCode', address, tag: 'latest' });
      return typeof r.result === 'string' ? r.result : null;
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
      const r = await this.fetch(`${this.cfg.chain.esploraUrl}/address/${address}/txs`);
      if (r.status !== 200) return null;
      const txs = JSON.parse(r.body) as { txid: string; status: { block_time?: number }; vin: { prevout?: { scriptpubkey_address?: string; value: number } }[]; vout: { scriptpubkey_address?: string; value: number }[] }[];
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
  explorerUrl = explorer;
  sourceFor(chain: Chain) {
    return this.pick(chain)?.id ?? 'brak dostawcy';
  }
}

export function createChainProvider(cfg: EngineConfig, fetch: SafeFetch): CompositeProvider {
  if (cfg.chain.provider === 'fixture') return new CompositeProvider([new FixtureProvider(cfg.chain.fixturesDir)]);
  return new CompositeProvider([new EtherscanProvider(cfg, fetch), new EsploraProvider(cfg, fetch), new TronGridProvider(cfg, fetch)]);
}
