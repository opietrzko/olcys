/**
 * Klastrowanie adresów Bitcoina - heurystyka wspólnego wejścia (common-input-ownership, Meiklejohn i in. 2013).
 *
 * Transakcja wydająca środki z kilku adresów musi być podpisana kluczami każdego z nich, więc zwykle tworzy ją
 * jeden portfel. Adresy współwydawane z badanym adresem to kandydaci na adresy tego samego posiadacza.
 * Wyjątek: CoinJoin (Wasabi, Whirlpool, JoinMarket) celowo łączy wejścia wielu osób - takie transakcje pomijamy.
 * Wynik jest WNIOSKIEM do weryfikacji, a nie faktem: nie wpływa na Wskaźnik Pewności.
 */
import type { LabelRegistry } from './labels';
import type { AddressCategory } from './types';

export interface UtxoTx {
  txid: string;
  timestamp: string;
  inputs: { address?: string; value: number }[];
  outputs: { address?: string; value: number }[];
}

export interface ClusterMember {
  address: string;
  /** Transakcje, w których adres był współwydawany z badanym adresem. */
  txHashes: string[];
  label?: string;
  category?: AddressCategory;
}

export interface AddressCluster {
  method: 'common-input-ownership';
  members: ClusterMember[];
  /** Transakcje wielowejściowe z badanym adresem uwzględnione w klastrze. */
  multiInputTxs: number;
  /** Pominięte transakcje o cechach CoinJoin (wejścia wielu osób). */
  coinjoinSkipped: string[];
  /** Członkowie klastra z etykietą giełdy / usługi - sygnał, że adres może być kontem custodial, a nie portfelem osoby. */
  labeledMembers: number;
}

/** Wzorzec CoinJoin: ≥ 5 różnych adresów wejściowych i ≥ 3 wyjścia o identycznej kwocie. */
export function looksLikeCoinjoin(tx: UtxoTx): boolean {
  const ins = new Set(tx.inputs.map((i) => i.address).filter(Boolean));
  if (ins.size < 5) return false;
  const counts = new Map<number, number>();
  for (const o of tx.outputs) counts.set(o.value, (counts.get(o.value) ?? 0) + 1);
  return Math.max(0, ...counts.values()) >= 3;
}

export function clusterCommonInputs(address: string, txs: UtxoTx[], labels?: LabelRegistry, max = 50): AddressCluster | undefined {
  const members = new Map<string, ClusterMember>();
  const coinjoinSkipped: string[] = [];
  let multiInputTxs = 0;
  for (const tx of txs) {
    const ins = [...new Set(tx.inputs.map((i) => i.address).filter((a): a is string => Boolean(a)))];
    if (!ins.includes(address) || ins.length < 2) continue;
    if (looksLikeCoinjoin(tx)) {
      coinjoinSkipped.push(tx.txid);
      continue;
    }
    multiInputTxs++;
    for (const a of ins) {
      if (a === address) continue;
      const m = members.get(a) ?? { address: a, txHashes: [] };
      if (!m.txHashes.includes(tx.txid)) m.txHashes.push(tx.txid);
      members.set(a, m);
    }
  }
  if (!members.size && !coinjoinSkipped.length) return undefined;
  const list = [...members.values()].sort((a, b) => b.txHashes.length - a.txHashes.length).slice(0, max);
  for (const m of list) {
    const l = labels?.get('BTC', m.address);
    if (l) {
      m.label = l.entity;
      m.category = l.category;
    }
  }
  return { method: 'common-input-ownership', members: list, multiInputTxs, coinjoinSkipped, labeledMembers: list.filter((m) => m.label).length };
}
