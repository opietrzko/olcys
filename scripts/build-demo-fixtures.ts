/**
 * Buduje syntetyczne dane blockchain (fixtures/chain) dla scenariusza demonstracyjnego.
 * Uruchom: npx tsx scripts/build-demo-fixtures.ts
 * Format pliku: { chain, address, code?, note, transfers: Transfer[] }
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { A } from '../apps/mock-web/src/persona';

type T = { hash: string; timestamp: string; from: string; to: string; asset: string; amount: number; tokenContract?: string; method?: string };
const root = join(import.meta.dirname, '..', 'fixtures', 'chain');
const h = (seed: string, prefix = '0x') => prefix + createHash('sha256').update('olcys-demo-tx:' + seed).digest('hex');

function write(chain: string, address: string, transfers: T[], code?: string, note = 'Dane syntetyczne scenariusza demo') {
  mkdirSync(join(root, chain), { recursive: true });
  writeFileSync(join(root, chain, `${address}.json`), JSON.stringify({ chain, address, code, note, transfers }, null, 2));
}

const eth = (seed: string, ts: string, from: string, to: string, amount: number, asset = 'ETH', extra: Partial<T> = {}): T => ({ hash: h(seed), timestamp: ts, from, to, asset, amount, ...extra });

// --- ETH_MAIN: wpływy → swap ETH→USDT (Uniswap) → USDT na adres depozytowy → sweep do Binance; ETH bezpośrednio na Krakena
const swapHash = h('main-swap');
const depositHash = h('main-to-deposit');
const mainTx: T[] = [
  eth('main-in-1', '2025-02-03T10:00:00Z', A.ETH_P[0], A.ETH_MAIN, 2.5),
  eth('main-in-2', '2025-03-11T15:20:00Z', A.ETH_P[1], A.ETH_MAIN, 4.0),
  eth('main-in-3', '2025-04-20T08:45:00Z', A.ETH_P[2], A.ETH_MAIN, 1.2),
  { hash: swapHash, timestamp: '2025-05-02T11:00:00Z', from: A.ETH_MAIN, to: A.UNISWAP_V2_ROUTER, asset: 'ETH', amount: 3.0, method: 'swapExactETHForTokens' },
  { hash: swapHash, timestamp: '2025-05-02T11:00:00Z', from: A.UNISWAP_V2_USDT_PAIR, to: A.ETH_MAIN, asset: 'USDT', amount: 9000, tokenContract: A.USDT_ETH, method: 'swapExactETHForTokens' },
  { hash: depositHash, timestamp: '2025-05-04T09:00:00Z', from: A.ETH_MAIN, to: A.ETH_DEPOSIT, asset: 'USDT', amount: 8500, tokenContract: A.USDT_ETH, method: 'transfer' },
  eth('main-to-kraken', '2025-06-10T16:30:00Z', A.ETH_MAIN, A.KRAKEN_1, 1.5),
  eth('main-in-4', '2025-07-01T12:00:00Z', A.ETH_P[3], A.ETH_MAIN, 0.8),
];
write('ETH', A.ETH_MAIN, mainTx, '0x');

// adres depozytowy giełdy (nieoznaczony) – sweep 100% do Binance 14 po 3 h
write('ETH', A.ETH_DEPOSIT, [
  { hash: depositHash, timestamp: '2025-05-04T09:00:00Z', from: A.ETH_MAIN, to: A.ETH_DEPOSIT, asset: 'USDT', amount: 8500, tokenContract: A.USDT_ETH, method: 'transfer' },
  { hash: h('deposit-sweep'), timestamp: '2025-05-04T12:05:00Z', from: A.ETH_DEPOSIT, to: A.BINANCE_14, asset: 'USDT', amount: 8500, tokenContract: A.USDT_ETH, method: 'transfer' },
], '0x');

// --- ETH_OLD (adres sprzed podmiany): kontakt z Tornado Cash
write('ETH', A.ETH_OLD, [
  eth('old-in', '2023-08-01T10:00:00Z', A.ETH_P[5], A.ETH_OLD, 1.0),
  eth('old-tc-1', '2023-08-03T21:00:00Z', A.ETH_OLD, A.TORNADO_01, 0.1, 'ETH', { method: 'deposit' }),
  eth('old-tc-2', '2023-08-03T21:10:00Z', A.ETH_OLD, A.TORNADO_01, 0.1, 'ETH', { method: 'deposit' }),
  eth('old-tc-3', '2023-08-03T21:20:00Z', A.ETH_OLD, A.TORNADO_01, 0.1, 'ETH', { method: 'deposit' }),
], '0x');

write('ETH', A.ETH_NEW, [
  eth('new-in', '2025-07-16T10:00:00Z', A.ETH_MAIN, A.ETH_NEW, 0.5),
  eth('new-out', '2025-07-20T10:00:00Z', A.ETH_NEW, A.KRAKEN_1, 0.45),
], '0x');
write('ETH', A.ETH_ALIAS, [
  eth('alias-in-1', '2025-06-19T10:00:00Z', A.ETH_P[4], A.ETH_ALIAS, 1.1),
  eth('alias-in-2', '2025-06-22T10:00:00Z', A.ETH_P[5], A.ETH_ALIAS, 0.9),
  eth('alias-out', '2025-06-25T10:00:00Z', A.ETH_ALIAS, A.BINANCE_14, 1.9),
], '0x');
write('ETH', A.ETH_TG, [eth('tg-in', '2025-06-03T08:00:00Z', A.ETH_P[4], A.ETH_TG, 0.3)], '0x');
write('ETH', A.ETH_GIVEAWAY_OWN, [], '0x');
write('ETH', A.ETH_GIVEAWAY_ORG, [
  eth('org-in-1', '2025-04-01T10:06:00Z', A.ETH_P[0], A.ETH_GIVEAWAY_ORG, 0.1),
  eth('org-in-2', '2025-04-01T10:10:00Z', A.ETH_P[1], A.ETH_GIVEAWAY_ORG, 0.1),
], '0x');
write('ETH', A.ETH_HOMONYM, [eth('hom-in', '2025-05-15T10:00:00Z', A.ETH_P[2], A.ETH_HOMONYM, 0.6)], '0x');
// kontrakty – bytecode != 0x
write('ETH', A.ETH_NFT_CONTRACT, [], '0x608060405234801561001057600080fd5b50600436106100365760003560e01c8063');
write('ETH', A.UNISWAP_V2_ROUTER, [], '0x60c06040523480156200001157600080fd5b5060405162005b7a38038062005b7a');
write('ETH', A.BINANCE_14, [], '0x');
write('ETH', A.UKRAINE_ETH, [], '0x');

// --- BTC_MAIN: wpływy i wysyłka na zimny portfel Binance
write('BTC', A.BTC_MAIN, [
  { hash: h('btc-in-1', ''), timestamp: '2024-11-12T10:00:00Z', from: A.BTC_P[0], to: A.BTC_MAIN, asset: 'BTC', amount: 0.15 },
  { hash: h('btc-in-2', ''), timestamp: '2025-01-22T09:00:00Z', from: A.BTC_P[1], to: A.BTC_MAIN, asset: 'BTC', amount: 0.4 },
  { hash: h('btc-out-cex', ''), timestamp: '2025-03-05T17:00:00Z', from: A.BTC_MAIN, to: A.BINANCE_BTC_COLD, asset: 'BTC', amount: 0.5 },
]);

// --- TRON_P2P: okrągłe wpłaty USDT od wielu kupujących → wysyłka do (fikcyjnego) kantoru
const amounts = [500, 1000, 250, 1500, 750, 2000];
write('TRON', A.TRON_P2P, [
  ...A.TRON_BUYERS.map((b, i): T => ({ hash: h(`tron-buy-${i}`, ''), timestamp: `2025-05-${String(22 + i).padStart(2, '0')}T1${i}:00:00Z`, from: b, to: A.TRON_P2P, asset: 'USDT', amount: amounts[i], tokenContract: A.USDT_TRON })),
  { hash: h('tron-offramp', ''), timestamp: '2025-06-01T10:00:00Z', from: A.TRON_P2P, to: A.TRON_OFFRAMP, asset: 'USDT', amount: 5000, tokenContract: A.USDT_TRON },
]);

mkdirSync(join(root, '..'), { recursive: true });
writeFileSync(
  join(root, '..', 'rates.json'),
  JSON.stringify({ source: 'Kursy stałe scenariusza demo (wartości przykładowe)', asOf: '2025-06-30', usdPln: 3.95, usd: { ETH: 2500, BTC: 95000, USDT: 1, USDC: 1, DAI: 1, TRX: 0.25, LTC: 90, SOL: 150 } }, null, 2),
);
console.log('Zapisano fixtures do', root);
