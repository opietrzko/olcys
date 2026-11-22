import { describe, expect, it } from 'vitest';
import { analyzeChain, LabelRegistry, synthetic, flowCategory, type Transfer } from '../src';

const me = synthetic.eth('me');
const CEX = '0x28C6c06298d514Db089934071355E5743bf21d60';
const RAMP = synthetic.eth('moonpay');
const DEX = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const labels = new LabelRegistry([
  { chain: 'ETH', address: CEX, entity: 'Binance 14', category: 'CEX', source: 't' },
  { chain: 'ETH', address: RAMP, entity: 'MoonPay: Hot Wallet', category: 'OFFRAMP', source: 't' },
  { chain: 'ETH', address: DEX, entity: 'Uniswap', category: 'DEX', source: 't' },
]);
const rates = { source: 'test', asOf: '', usdPln: 4, usd: { ETH: 2000, USDT: 1 } };
const tr = (hash: string, from: string, to: string, asset: string, amount: number, extra: Partial<Transfer> = {}): Transfer => ({ chain: 'ETH', hash, timestamp: '2025-01-01T00:00:00Z', from, to, asset, amount, ...extra });

describe('mapa przepływów', () => {
  const transfers = [
    tr('a', synthetic.eth('friend1'), me, 'ETH', 2), // 16 000 PLN z adresu bez etykiety
    tr('b', synthetic.eth('friend2'), me, 'ETH', 1), // 8 000 PLN z adresu bez etykiety
    tr('c', CEX, me, 'ETH', 0.5), // wypłata z giełdy
    tr('d', me, CEX, 'ETH', 1), // wyjście na giełdę
    tr('e', me, RAMP, 'ETH', 0.25), // bramka fiat
    tr('f', me, DEX, 'ETH', 0.5), // wymiana na DEX – nie cash-out
    tr('s', me, me, 'ETH', 3), // przelew na własny adres – pomijany
    tr('g', synthetic.eth('spam'), me, 'USDT', 1_000_000, { tokenContract: synthetic.eth('fake-usdt') }), // fałszywy USDT
  ];
  const a = analyzeChain({ chain: 'ETH', address: me, transfers, labels, rates, dataSource: 'test' });
  const flows = a.flows!;

  it('grupuje wpływy i wypływy według kategorii kontrahenta, w PLN', () => {
    expect(flows.inflows.map((b) => [b.category, b.pln, b.counterpartyCount])).toEqual([
      ['UNLABELED', 24000, 2],
      ['CEX', 4000, 1],
    ]);
    expect(flows.outflows.map((b) => [b.category, b.pln])).toEqual([
      ['CEX', 8000],
      ['DEX', 4000],
      ['OFFRAMP', 2000],
    ]);
  });

  it('oznacza wyjście do fiat tylko dla wypływów do giełd, bramek i P2P', () => {
    expect(flows.outflows.filter((b) => b.cashOut).map((b) => b.category).sort()).toEqual(['CEX', 'OFFRAMP']);
    expect(flows.inflows.some((b) => b.cashOut)).toBe(false);
    expect(flows.cashOutPln).toBe(10000);
  });

  it('pomija niezweryfikowane tokeny i podaje kontrahentów z etykietą', () => {
    expect(flows.totalInPln).toBe(28000);
    expect(flows.outflows.find((b) => b.category === 'OFFRAMP')!.top[0]).toMatchObject({ label: 'MoonPay: Hot Wallet', pln: 2000, txCount: 1 });
  });

  it('mapuje kategorie etykiet na grupy wykresu', () => {
    expect(flowCategory('CUSTODIAL')).toBe('CEX');
    expect(flowCategory('P2P_SERVICE')).toBe('P2P');
    expect(flowCategory('SANCTIONED')).toBe('MIXER');
    expect(flowCategory(undefined)).toBe('UNLABELED');
  });
});
