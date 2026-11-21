import { describe, expect, it } from 'vitest';
import { analyzeChain, LabelRegistry, synthetic, type Transfer } from '../src';

const me = synthetic.eth('me');
const dep = synthetic.eth('deposit');
const CEX = '0x28C6c06298d514Db089934071355E5743bf21d60';
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const labels = new LabelRegistry([
  { chain: 'ETH', address: CEX, entity: 'Binance 14', category: 'CEX', source: 't' },
  { chain: 'ETH', address: ROUTER, entity: 'Uniswap', category: 'DEX', source: 't' },
]);
const rates = { source: 'test', asOf: '', usdPln: 4, usd: { ETH: 2000, USDT: 1 } };
const tr = (hash: string, ts: string, from: string, to: string, asset: string, amount: number): Transfer => ({ chain: 'ETH', hash, timestamp: ts, from, to, asset, amount });

describe('wskaźniki cash-out', () => {
  it('wykrywa swap na stablecoiny, adres depozytowy giełdy i wolumen', () => {
    const transfers = [
      tr('h1', '2025-01-01T00:00:00Z', synthetic.eth('x'), me, 'ETH', 10),
      tr('h2', '2025-01-02T00:00:00Z', me, ROUTER, 'ETH', 5),
      tr('h2', '2025-01-02T00:00:00Z', synthetic.eth('pair'), me, 'USDT', 10000),
      tr('h3', '2025-01-03T00:00:00Z', me, dep, 'USDT', 9000),
    ];
    const neighbours = new Map([[dep, [tr('h3', '2025-01-03T00:00:00Z', me, dep, 'USDT', 9000), tr('h4', '2025-01-03T02:00:00Z', dep, CEX, 'USDT', 9000)]]]);
    const a = analyzeChain({ chain: 'ETH', address: me, transfers, neighbours, labels, rates, dataSource: 'test' });
    const types = a.indicators.map((i) => i.type);
    expect(types).toContain('STABLECOIN_SWAP');
    expect(types).toContain('CEX_DEPOSIT_INFERRED');
    expect(types).toContain('HIGH_VOLUME');
    expect(a.indicators.find((i) => i.type === 'CEX_DEPOSIT_INFERRED')!.basis).toBe('inferred');
    expect(a.totalInPln).toBe(a.totalInUsd * 4);
  });

  it('nie oznacza adresu jako depozytowego, gdy środki nie trafiają na giełdę', () => {
    const t = [tr('h1', '2025-01-01T00:00:00Z', me, dep, 'ETH', 1)];
    const neighbours = new Map([[dep, [t[0], tr('h2', '2025-01-01T01:00:00Z', dep, synthetic.eth('other'), 'ETH', 1)]]]);
    const a = analyzeChain({ chain: 'ETH', address: me, transfers: t, neighbours, labels, rates, dataSource: 'test' });
    expect(a.indicators.map((i) => i.type)).not.toContain('CEX_DEPOSIT_INFERRED');
  });
});
