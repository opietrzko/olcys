/**
 * Dostawcy danych blockchain: Etherscan (API v2, wiele sieci EVM), Esplora (BTC – możliwy self-hosting, np. mempool.space), TronGrid,
 * JSON-RPC Solany (publiczny węzeł lub własny).
 * Interfejs pozwala podmienić źródło na węzeł własny KAS bez zmian w logice analizy.
 */
import { addressKey, base58checkEncode, toChecksumAddress, resolveAsset, EVM_NETWORKS, type Chain, type Transfer, type UtxoTx } from '@olcys/core';
import type { EngineConfig } from '../config';
import type { SafeFetch } from '../http';

export interface ChainProvider {
  id: string;
  supports(chain: Chain): boolean;
  /** null = brak danych / błąd dostawcy (adres niezweryfikowany). `mainOnly` – tylko sieć główna (np. dla kontrahentów). */
  getTransfers(chain: Chain, address: string, opts?: { mainOnly?: boolean; maxTx?: number }): Promise<Transfer[] | null>;
  /** Łączna liczba transakcji adresu (cała historia), gdy dostawca ją udostępnia – do heurystyki adresu instytucjonalnego. */
  getStats?(chain: Chain, address: string): Promise<{ txCount?: number } | null>;
  /** Uwagi z ostatniego zapytania (np. sieć EVM niedostępna) – trafiają do przebiegu analizy. */
  notes?: string[];
  /** Bytecode adresu (EVM). null = nie sprawdzono. */
  getCode(chain: Chain, address: string): Promise<string | null>;
  /** Powód ostatniego niepowodzenia (np. limit zapytań) – trafia do przebiegu analizy zamiast cichego „brak danych”. */
  lastError?: string;
  /** Etykieta / nazwa adresu z API eksploratora (KROK 3.1 załącznika). */
  getInfo?(chain: Chain, address: string): Promise<AddressInfo | null>;
  explorerUrl(chain: Chain, address: string): string | undefined;
  /** UTXO (BTC): transakcje adresu z pełną listą wejść i wyjść z ostatniego getTransfers – do klastrowania adresów. */
  utxoTxs?(chain: Chain, address: string): UtxoTx[] | undefined;
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
  constructor(private cfg: EngineConfig, private fetch: SafeFetch, private chainId = 1, private network = 'ethereum') {
    this.id = cfg.chain.evmApiKey ? `etherscan-v2${network === 'ethereum' ? '' : ` (${EVM_NETWORKS[network]?.label ?? network})`}` : `blockscout (${new URL(cfg.chain.evmApiUrl).host})`;
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
      if (!Array.isArray(native.result) && !Array.isArray(tokens.result)) {
        const msg = ([native, tokens] as { result?: unknown; message?: string }[]).map((x) => (typeof x.result === 'string' ? x.result : x.message)).find(Boolean);
        if (msg) this.lastError = `${this.id}: ${String(msg).slice(0, 160)}`;
        return null;
      }
      if (this.network !== 'ethereum') {
        const nativeSym = EVM_NETWORKS[this.network]?.native ?? 'ETH';
        for (const t of out) {
          t.network = this.network;
          if (!t.tokenContract && t.asset === 'ETH') t.asset = nativeSym;
        }
      }
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
  /** Blockscout v2: łączna liczba transakcji adresu. */
  async getStats(_chain: Chain, address: string): Promise<{ txCount?: number } | null> {
    if (this.network !== 'ethereum') return null;
    try {
      const r = await this.fetch(`${this.cfg.chain.blockscoutUrl}/api/v2/addresses/${address}/counters`, { headers: { accept: 'application/json' }, timeoutMs: 8000 });
      if (r.status !== 200) return null;
      const d = JSON.parse(r.body) as { transactions_count?: string; token_transfers_count?: string };
      const n = Number(d.transactions_count ?? 0) + Number(d.token_transfers_count ?? 0);
      return Number.isFinite(n) ? { txCount: n } : null;
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
  lastError?: string;
  private utxo = new Map<string, UtxoTx[]>();
  utxoTxs(_chain: Chain, address: string) {
    return this.utxo.get(address);
  }
  constructor(private cfg: EngineConfig, private fetch: SafeFetch) {}
  supports(chain: Chain) {
    return chain === 'BTC';
  }
  /** Instancje Esplora w kolejności: skonfigurowana, potem zapasowe (np. mempool.space) – przy limicie 429 / błędzie. */
  private get bases() {
    return [...new Set([this.cfg.chain.esploraUrl, ...this.cfg.chain.esploraFallbacks])];
  }
  /** GET z ponowieniem przy limicie (429) i przełączeniem na zapasową instancję. */
  private async get(path: string): Promise<{ status: number; body: string } | null> {
    const errors: string[] = [];
    for (const base of this.bases) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await this.fetch(`${base}${path}`);
          if (r.status === 429 || r.status >= 500) {
            errors.push(`${new URL(base).host}: HTTP ${r.status}`);
            if (r.status === 429 && attempt === 0) {
              await new Promise((res) => setTimeout(res, 2000));
              continue;
            }
            break;
          }
          this.id = `esplora (${new URL(base).host})`;
          return r;
        } catch (e) {
          errors.push(`${new URL(base).host}: ${(e as Error).message}`);
          break;
        }
      }
    }
    this.lastError = `Esplora niedostępna – ${errors.join('; ')}${errors.some((e) => e.includes('429')) ? ' (limit zapytań na IP; ustaw własną instancję ESPLORA_URL)' : ''}`;
    return null;
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      this.lastError = undefined;
      type EsTx = { txid: string; status: { confirmed?: boolean; block_time?: number }; vin: { prevout?: { scriptpubkey_address?: string; value: number } }[]; vout: { scriptpubkey_address?: string; value: number }[] };
      const r = await this.get(`/address/${address}/txs`);
      if (!r || r.status !== 200) return null;
      const txs = JSON.parse(r.body) as EsTx[];
      // stronicowanie historii potwierdzonych transakcji (po 25), maks. 4 strony
      for (let page = 0; page < 3 && txs.length >= 25 * (page + 1); page++) {
        const last = [...txs].reverse().find((t) => t.status.confirmed !== false);
        if (!last) break;
        const n = await this.get(`/address/${address}/txs/chain/${last.txid}`);
        if (!n || n.status !== 200) break;
        const more = JSON.parse(n.body) as EsTx[];
        if (!more.length) break;
        txs.push(...more);
      }
      const out: Transfer[] = [];
      this.utxo.set(
        address,
        txs.map((tx) => ({
          txid: tx.txid,
          timestamp: new Date((tx.status.block_time ?? Date.now() / 1000) * 1000).toISOString(),
          inputs: tx.vin.map((v) => ({ address: v.prevout?.scriptpubkey_address, value: v.prevout?.value ?? 0 })),
          outputs: tx.vout.map((o) => ({ address: o.scriptpubkey_address, value: o.value })),
        })),
      );
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
  async getStats(_chain: Chain, address: string): Promise<{ txCount?: number } | null> {
    try {
      const r = await this.get(`/address/${address}`);
      if (!r || r.status !== 200) return null;
      const d = JSON.parse(r.body) as { chain_stats?: { tx_count?: number } };
      return { txCount: d.chain_stats?.tx_count };
    } catch {
      return null;
    }
  }
  explorerUrl = explorer;
}

/** Adres TRON w zapisie hex (41…) → Base58Check (T…). */
export function tronHexToBase58(hex: string): string {
  const clean = hex.replace(/^0x/, '');
  const bytes = Uint8Array.from(clean.match(/../g)!.map((b) => parseInt(b, 16)));
  return base58checkEncode(bytes);
}

export class TronGridProvider implements ChainProvider {
  id = 'trongrid';
  lastError?: string;
  constructor(private cfg: EngineConfig, private fetch: SafeFetch) {}
  supports(chain: Chain) {
    return chain === 'TRON';
  }
  async getTransfers(chain: Chain, address: string): Promise<Transfer[] | null> {
    try {
      this.lastError = undefined;
      const r = await this.fetch(`${this.cfg.chain.tronGridUrl}/v1/accounts/${address}/transactions/trc20?limit=200&only_confirmed=true`);
      if (r.status !== 200) {
        this.lastError = `TronGrid HTTP ${r.status}`;
        return null;
      }
      const data = JSON.parse(r.body).data as { transaction_id: string; block_timestamp: number; from: string; to: string; value: string; token_info: { symbol: string; decimals: number; address: string } }[];
      const out: Transfer[] = data.map((t) => ({ chain, hash: t.transaction_id, timestamp: new Date(t.block_timestamp).toISOString(), from: t.from, to: t.to, asset: t.token_info.symbol, amount: Number(t.value) / 10 ** t.token_info.decimals, tokenContract: t.token_info.address }));
      // natywne TRX (TransferContract) – kwoty w SUN (1 TRX = 10^6 SUN), adresy w zapisie hex 41…
      try {
        const n = await this.fetch(`${this.cfg.chain.tronGridUrl}/v1/accounts/${address}/transactions?limit=200&only_confirmed=true`);
        if (n.status === 200) {
          type TronTx = { txID: string; block_timestamp: number; ret?: { contractRet?: string }[]; raw_data: { contract: { type: string; parameter: { value: { amount?: number; owner_address?: string; to_address?: string } } }[] } };
          for (const tx of (JSON.parse(n.body).data ?? []) as TronTx[]) {
            const c = tx.raw_data?.contract?.[0];
            if (c?.type !== 'TransferContract' || tx.ret?.[0]?.contractRet !== 'SUCCESS') continue;
            const v = c.parameter.value;
            if (!v.owner_address || !v.to_address || !v.amount) continue;
            out.push({ chain, hash: tx.txID, timestamp: new Date(tx.block_timestamp).toISOString(), from: tronHexToBase58(v.owner_address), to: tronHexToBase58(v.to_address), asset: 'TRX', amount: v.amount / 1e6 });
          }
        }
      } catch {
        /* brak natywnych TRX nie unieważnia transferów TRC20 */
      }
      return out;
    } catch (e) {
      this.lastError = (e as Error).message;
      return null;
    }
  }
  /** Flaga kontraktu TRON: /wallet/getcontract zwraca bytecode dla smart kontraktu i {} dla konta. */
  async getCode(_chain: Chain, address: string): Promise<string | null> {
    try {
      const r = await this.fetch(`${this.cfg.chain.tronGridUrl}/wallet/getcontract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: address, visible: true }) });
      if (r.status !== 200) return null;
      const d = JSON.parse(r.body) as { bytecode?: string; contract_address?: string };
      return d.contract_address ? `0x${d.bytecode || 'ff'}` : '0x';
    } catch {
      return null;
    }
  }
  explorerUrl = explorer;
}

/* ---------- Solana ---------- */

interface SolParsedIx {
  program?: string;
  parsed?: { type?: string; info?: Record<string, any> } | string;
}
interface SolTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { decimals: number };
}
interface SolTx {
  blockTime?: number | null;
  meta: { err: unknown; preTokenBalances?: SolTokenBalance[]; postTokenBalances?: SolTokenBalance[]; innerInstructions?: { instructions: SolParsedIx[] }[] } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[]; instructions: SolParsedIx[] } };
}

/**
 * Transfery adresu z jednej transakcji Solany (kodowanie jsonParsed): przelewy SOL (System Program) i tokenów SPL
 * (Token / Token-2022, także w instrukcjach wewnętrznych). Konto tokenowe zamieniane na właściciela z pre/postTokenBalances,
 * bo wpłata USDC trafia na konto tokenowe, a nie bezpośrednio na adres portfela.
 */
export function parseSolanaTransfers(address: string, signature: string, tx: SolTx): Transfer[] {
  if (!tx.meta || tx.meta.err) return [];
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const tokenAcc = new Map<string, { owner?: string; mint: string; decimals: number }>();
  for (const b of [...(tx.meta.preTokenBalances ?? []), ...(tx.meta.postTokenBalances ?? [])]) {
    const acc = keys[b.accountIndex];
    if (acc) tokenAcc.set(acc, { owner: b.owner, mint: b.mint, decimals: b.uiTokenAmount.decimals });
  }
  const timestamp = new Date((tx.blockTime ?? Date.now() / 1000) * 1000).toISOString();
  const ixs = [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap((i) => i.instructions)];
  const out: Transfer[] = [];
  for (const ix of ixs) {
    if (!ix.parsed || typeof ix.parsed === 'string') continue;
    const { type, info } = ix.parsed;
    if (!info) continue;
    if (ix.program === 'system' && (type === 'transfer' || type === 'transferWithSeed')) {
      const from = info.source as string;
      const to = info.destination as string;
      if (from !== address && to !== address) continue;
      out.push({ chain: 'SOL', hash: signature, timestamp, from, to, asset: 'SOL', amount: Number(info.lamports) / 1e9, network: 'sol' });
    } else if ((ix.program === 'spl-token' || ix.program === 'spl-token-2022') && (type === 'transfer' || type === 'transferChecked')) {
      const src = tokenAcc.get(info.source);
      const dst = tokenAcc.get(info.destination);
      const from = src?.owner ?? (info.authority as string | undefined) ?? (info.multisigAuthority as string | undefined) ?? info.source;
      const to = dst?.owner ?? info.destination;
      if (from !== address && to !== address) continue;
      const mint = (info.mint as string | undefined) ?? src?.mint ?? dst?.mint;
      if (!mint) continue;
      const decimals = info.tokenAmount?.decimals ?? src?.decimals ?? dst?.decimals ?? 0;
      const amount = info.tokenAmount ? Number(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount) : Number(info.amount) / 10 ** decimals;
      const t: Transfer = { chain: 'SOL', hash: signature, timestamp, from, to, asset: `SPL ${mint.slice(0, 6)}…`, amount, tokenContract: mint, network: 'sol' };
      const known = resolveAsset(t);
      if (known.verified) t.asset = known.symbol;
      out.push(t);
    }
  }
  return out;
}

/** Solana – publiczny JSON-RPC (getSignaturesForAddress + getTransaction jsonParsed); można wskazać własny węzeł (SOLANA_RPC_URL). */
export class SolanaRpcProvider implements ChainProvider {
  id: string;
  lastError?: string;
  notes: string[] = [];
  constructor(private cfg: EngineConfig, private fetch: SafeFetch) {
    this.id = `solana-rpc (${new URL(cfg.chain.solanaRpcUrl).host})`;
  }
  supports(chain: Chain) {
    return chain === 'SOL';
  }
  /** Wywołanie JSON-RPC z ponowieniem przy limicie (HTTP 429): 3 próby, odstęp 1,5 s / 3 s / 4,5 s. */
  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetch(this.cfg.chain.solanaRpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (r.status === 429 && attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }
      if (r.status !== 200) throw new Error(`Solana RPC ${method}: HTTP ${r.status}${r.status === 429 ? ' (limit zapytań publicznego węzła – ustaw SOLANA_RPC_URL)' : ''}`);
      const d = JSON.parse(r.body) as { result?: T; error?: { message: string } };
      if (d.error) throw new Error(`Solana RPC ${method}: ${d.error.message}`);
      return d.result as T;
    }
  }
  async getTransfers(_chain: Chain, address: string, opts?: { maxTx?: number }): Promise<Transfer[] | null> {
    this.lastError = undefined;
    const limit = Math.min(opts?.maxTx ?? this.cfg.chain.solanaMaxTx, 1000);
    let sigs: { signature: string; err: unknown }[];
    try {
      sigs = await this.rpc<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [address, { limit }]);
    } catch (e) {
      this.lastError = (e as Error).message;
      return null;
    }
    const out: Transfer[] = [];
    let failed = 0;
    for (const s of sigs.filter((x) => !x.err)) {
      try {
        const tx = await this.rpc<SolTx | null>('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }]);
        if (tx) out.push(...parseSolanaTransfers(address, s.signature, tx));
      } catch (e) {
        failed++;
        this.lastError = (e as Error).message;
        if (failed >= 3) break; // węzeł odmawia – nie zasypujemy go dalszymi zapytaniami
      }
    }
    if (sigs.length >= limit) this.notes.push(`Solana: pobrano ${limit} ostatnich transakcji adresu (SOLANA_MAX_TX) – historia może być niepełna`);
    if (failed) this.notes.push(`Solana: ${failed} transakcji nie pobrano (${this.lastError})`);
    return out;
  }
  /** Konto wykonywalne (program) = odpowiednik smart kontraktu. */
  async getCode(_chain: Chain, address: string): Promise<string | null> {
    try {
      const r = await this.rpc<{ value: { executable?: boolean } | null }>('getAccountInfo', [address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
      return r.value?.executable ? '0xff' : '0x';
    } catch {
      return null;
    }
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
  async getTransfers(chain: Chain, address: string, opts?: { mainOnly?: boolean; maxTx?: number }) {
    return (await this.pick(chain)?.getTransfers(chain, address, opts)) ?? null;
  }
  async getStats(chain: Chain, address: string) {
    return (await this.pick(chain)?.getStats?.(chain, address)) ?? null;
  }
  utxoTxs(chain: Chain, address: string) {
    return this.pick(chain)?.utxoTxs?.(chain, address);
  }
  /** Uwagi dostawcy dla sieci (np. niedostępna sieć EVM) – zbierane i czyszczone przy odczycie. */
  takeNotes(chain: Chain): string[] {
    const p = this.pick(chain);
    const n = p?.notes ?? [];
    if (p) p.notes = [];
    return n;
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

/**
 * Adres EVM w wielu sieciach: sieć główna (Ethereum) + dodatkowe sieci z konfiguracji (Etherscan v2, jeden klucz).
 * Ten sam adres 0x to ten sam klucz prywatny w każdej sieci EVM, więc historia z L2 / BSC należy do tego samego posiadacza.
 */
export class MultiEvmProvider implements ChainProvider {
  id: string;
  notes: string[] = [];
  lastError?: string;
  constructor(private main: EtherscanProvider, private extra: { network: string; provider: EtherscanProvider }[]) {
    this.id = [main.id, ...extra.map((e) => EVM_NETWORKS[e.network]?.label ?? e.network)].join(' + ');
  }
  supports(chain: Chain) {
    return chain === 'ETH';
  }
  async getTransfers(chain: Chain, address: string, opts?: { mainOnly?: boolean }): Promise<Transfer[] | null> {
    const main = await this.main.getTransfers(chain, address);
    this.lastError = this.main.lastError;
    if (opts?.mainOnly || !this.extra.length) return main;
    const all = [...(main ?? [])];
    let any = main !== null;
    for (const e of this.extra) {
      const t = await e.provider.getTransfers(chain, address);
      if (t === null) {
        this.notes.push(`${EVM_NETWORKS[e.network]?.label ?? e.network}: brak danych${e.provider.lastError ? ` (${e.provider.lastError})` : ''}`);
        continue;
      }
      any = true;
      if (t.length) this.notes.push(`${EVM_NETWORKS[e.network]?.label ?? e.network}: ${t.length} transferów adresu`);
      all.push(...t);
    }
    return any ? all : null;
  }
  getCode(chain: Chain, address: string) {
    return this.main.getCode(chain, address);
  }
  getStats(chain: Chain, address: string) {
    return this.main.getStats(chain, address);
  }
  getInfo(chain: Chain, address: string) {
    return this.main.getInfo(chain, address);
  }
  explorerUrl = explorer;
}

export function createChainProvider(cfg: EngineConfig, fetch: SafeFetch): CompositeProvider {
  const extra = cfg.chain.evmNetworks
    .filter((n) => EVM_NETWORKS[n] && n !== 'ethereum')
    .map((network) => ({ network, provider: new EtherscanProvider(cfg, fetch, EVM_NETWORKS[network].chainId, network) }));
  const evm = new MultiEvmProvider(new EtherscanProvider(cfg, fetch), extra);
  return new CompositeProvider([evm, new EsploraProvider(cfg, fetch), new TronGridProvider(cfg, fetch), new SolanaRpcProvider(cfg, fetch)]);
}
