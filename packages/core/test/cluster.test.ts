import { describe, expect, it } from 'vitest';
import { clusterCommonInputs, LabelRegistry, looksLikeCoinjoin, synthetic, type UtxoTx } from '../src';

const A = synthetic.btcBech32('subject');
const B = synthetic.btcBech32('co-spent-1');
const C = synthetic.btcLegacy('co-spent-2');
const EX = synthetic.btcBech32('exchange-hot');
const other = (i: number) => synthetic.btcBech32(`coinjoin-${i}`);

const tx = (txid: string, inputs: string[], outputs: { address: string; value: number }[]): UtxoTx => ({
  txid,
  timestamp: '2026-01-01T00:00:00.000Z',
  inputs: inputs.map((address) => ({ address, value: 10_000 })),
  outputs,
});

describe('BTC – heurystyka wspólnego wejścia', () => {
  it('łączy adresy współwydawane z badanym adresem', () => {
    const c = clusterCommonInputs(A, [
      tx('t1', [A, B], [{ address: other(99), value: 15_000 }]),
      tx('t2', [B, A, C], [{ address: other(98), value: 20_000 }]),
      tx('t3', [A], [{ address: B, value: 5_000 }]), // jedno wejście – nic nie wnosi
      tx('t4', [B, C], [{ address: A, value: 5_000 }]), // badany adres tylko na wyjściu
    ])!;
    expect(c.multiInputTxs).toBe(2);
    expect(c.members.map((m) => m.address)).toEqual([B, C]);
    expect(c.members[0].txHashes).toEqual(['t1', 't2']);
    expect(c.labeledMembers).toBe(0);
  });

  it('pomija transakcje CoinJoin (wiele wejść, równe wyjścia)', () => {
    const cj = tx(
      'cj',
      [A, other(1), other(2), other(3), other(4)],
      [1, 2, 3, 4, 5].map((i) => ({ address: other(10 + i), value: 100_000 })),
    );
    expect(looksLikeCoinjoin(cj)).toBe(true);
    const c = clusterCommonInputs(A, [cj])!;
    expect(c.members).toHaveLength(0);
    expect(c.coinjoinSkipped).toEqual(['cj']);
  });

  it('oznacza członków klastra z etykietą instytucji', () => {
    const labels = new LabelRegistry([{ chain: 'BTC', address: EX, entity: 'Giełda X', category: 'CEX', source: 'test' }]);
    const c = clusterCommonInputs(A, [tx('t1', [A, EX], [{ address: other(7), value: 1 }])], labels)!;
    expect(c.labeledMembers).toBe(1);
    expect(c.members[0]).toMatchObject({ label: 'Giełda X', category: 'CEX' });
  });

  it('brak transakcji wielowejściowych = brak klastra', () => {
    expect(clusterCommonInputs(A, [tx('t1', [A], [{ address: B, value: 1 }])])).toBeUndefined();
  });
});
