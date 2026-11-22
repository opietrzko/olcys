/**
 * Rejestr zweryfikowanych kontraktów tokenów (stablecoiny, wrapped native).
 *
 * Symbol tokena może nadać każdy, kto wdroży kontrakt - w historii portfeli roi się od fałszywych "USDT"
 * (spam, zatruwanie adresów). Token liczy się do wyceny i wskaźników cash-out wyłącznie wtedy,
 * gdy adres jego kontraktu jest na tej liście. Kontrakty zweryfikowano wywołaniem symbol() w publicznym RPC
 * danej sieci oraz w eksploratorze (Blockscout) - 2026-11-21.
 */
import type { Transfer } from './types';

export interface KnownToken {
  symbol: string;
  /** Klucz ceny w tabeli kursów (np. USDC.e -> USDC, WETH -> ETH). */
  priceAs: string;
  stablecoin: boolean;
}

/** Sieci EVM obsługiwane przez dostawców (nazwa -> natywne aktywo). */
export const EVM_NETWORKS: Record<string, { chainId: number; native: string; label: string }> = {
  ethereum: { chainId: 1, native: 'ETH', label: 'Ethereum' },
  polygon: { chainId: 137, native: 'POL', label: 'Polygon' },
  arbitrum: { chainId: 42161, native: 'ETH', label: 'Arbitrum One' },
  bsc: { chainId: 56, native: 'BNB', label: 'BNB Smart Chain' },
  base: { chainId: 8453, native: 'ETH', label: 'Base' },
  optimism: { chainId: 10, native: 'ETH', label: 'OP Mainnet' },
};

const S = (symbol: string, priceAs = symbol): KnownToken => ({ symbol, priceAs, stablecoin: true });

const KNOWN: Record<string, Record<string, KnownToken>> = {
  ethereum: {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': S('USDT'),
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': S('USDC'),
    '0x6b175474e89094c44da98b954eedeac495271d0f': S('DAI'),
    '0x6c3ea9036406852006290770bedfcaba0e23a0e8': S('PYUSD'),
    '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409': S('FDUSD'),
    '0x4fabb145d64652a948d72533023f6e7a623c7c53': S('BUSD'),
    '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c': S('EURC'),
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', priceAs: 'ETH', stablecoin: false },
  },
  polygon: {
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': S('USDT'),
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': S('USDC'),
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': S('USDC.e', 'USDC'),
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': S('DAI'),
  },
  arbitrum: {
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': S('USDT'),
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': S('USDC'),
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': S('USDC.e', 'USDC'),
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': S('DAI'),
  },
  bsc: {
    '0x55d398326f99059ff775485246999027b3197955': S('USDT'),
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': S('USDC'),
    '0xe9e7cea3dedca5984780bafc599bd69add087d56': S('BUSD'),
  },
  base: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': S('USDC'),
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': S('USDbC', 'USDC'),
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': S('DAI'),
  },
  optimism: {
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': S('USDT'),
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': S('USDC'),
    '0x7f5c764cbc14f9669b88837ca1490cca17c31607': S('USDC.e', 'USDC'),
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': S('DAI'),
  },
  // Solana: SPL mint (adres emitenta tokena) - Circle USDC i Tether USDT
  sol: {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: S('USDC'),
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: S('USDT'),
  },
  tron: {
    TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: S('USDT'),
    TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: S('USDC'),
  },
};

/** Stablecoiny powiązane z dolarem - w wycenie historycznej przyjmujemy 1 USD (EURC: kurs EUR). */
export const USD_PEGGED = new Set(['USDT', 'USDC', 'DAI', 'PYUSD', 'FDUSD', 'BUSD']);

export function networkOf(t: Transfer): string {
  if (t.network) return t.network;
  return t.chain === 'ETH' ? 'ethereum' : t.chain === 'TRON' ? 'tron' : t.chain.toLowerCase();
}

export interface ResolvedAsset {
  /** Symbol do prezentacji. */
  symbol: string;
  /** Klucz ceny (null = aktywo bez wyceny). */
  priceKey: string | null;
  stablecoin: boolean;
  /** false = token spoza listy zweryfikowanych kontraktów (możliwy spam / fałszywy symbol). */
  verified: boolean;
  network: string;
}

/**
 * Rozpoznaje aktywo transferu. Aktywo natywne (brak kontraktu) jest zawsze wiarygodne.
 * Token z kontraktem spoza rejestru: symbol pokazujemy z adnotacją, ale nie wyceniamy go i nie liczymy do wskaźników.
 */
export function resolveAsset(t: Transfer): ResolvedAsset {
  const network = networkOf(t);
  if (!t.tokenContract) {
    const stable = USD_PEGGED.has(t.asset) || t.asset === 'EURC';
    return { symbol: t.asset, priceKey: t.asset, stablecoin: stable, verified: true, network };
  }
  const table = KNOWN[network] ?? {};
  const k = table[t.tokenContract] ?? table[t.tokenContract.toLowerCase()];
  if (k) return { symbol: k.symbol, priceKey: k.priceAs, stablecoin: k.stablecoin, verified: true, network };
  return { symbol: t.asset, priceKey: null, stablecoin: false, verified: false, network };
}
