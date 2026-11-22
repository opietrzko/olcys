/**
 * Mapa przepływów środków (wykres Sankeya): skąd przyszły środki na badany adres i dokąd poszły,
 * zgrupowane według kategorii kontrahenta z rejestru etykiet. Kwoty w PLN wg kursu NBP z chronologii.
 * To WYNIK OBLICZENIA na bezpośrednich kontrahentach (jeden krok od adresu) – bez śledzenia dalszej ścieżki.
 */
import { addressKey } from './chains';
import type { AddressCategory, Chain, ChainActivity, TimelineEntry } from './types';

export type FlowCategory = 'CEX' | 'OFFRAMP' | 'P2P' | 'DEX' | 'BRIDGE' | 'MIXER' | 'CONTRACT' | 'CHARITY' | 'UNLABELED';

export interface FlowCounterparty {
  address: string;
  label?: string;
  pln: number;
  txCount: number;
}

export interface FlowBucket {
  category: FlowCategory;
  label: string;
  direction: 'IN' | 'OUT';
  pln: number;
  txCount: number;
  /** Wypływ do giełdy, bramki krypto-fiat lub usługi P2P – możliwe wyjście do waluty tradycyjnej. */
  cashOut: boolean;
  counterpartyCount: number;
  /** Najwięksi kontrahenci w kategorii (do 5). */
  top: FlowCounterparty[];
}

export interface FlowMap {
  inflows: FlowBucket[];
  outflows: FlowBucket[];
  totalInPln: number;
  totalOutPln: number;
  /** Udział wypływów (PLN) do giełd, bramek fiat i P2P. */
  cashOutPln: number;
  basis: string;
}

export const FLOW_LABELS: Record<FlowCategory, string> = {
  CEX: 'Giełdy i portfele powiernicze',
  OFFRAMP: 'Bramki krypto-fiat i karty',
  P2P: 'Usługi P2P',
  DEX: 'DEX (wymiana krypto)',
  BRIDGE: 'Mosty między sieciami',
  MIXER: 'Miksery i podmioty sankcjonowane',
  CONTRACT: 'Kontrakty i tokeny',
  CHARITY: 'Zbiórki',
  UNLABELED: 'Adresy bez etykiety',
};

const CASH_OUT: ReadonlySet<FlowCategory> = new Set(['CEX', 'OFFRAMP', 'P2P']);

export function flowCategory(category: AddressCategory | undefined): FlowCategory {
  switch (category) {
    case 'CEX':
    case 'CUSTODIAL':
      return 'CEX';
    case 'OFFRAMP':
      return 'OFFRAMP';
    case 'P2P_SERVICE':
      return 'P2P';
    case 'DEX':
      return 'DEX';
    case 'BRIDGE':
      return 'BRIDGE';
    case 'MIXER':
    case 'SANCTIONED':
      return 'MIXER';
    case 'SMART_CONTRACT':
    case 'TOKEN_CONTRACT':
      return 'CONTRACT';
    case 'CHARITY':
      return 'CHARITY';
    default:
      return 'UNLABELED';
  }
}

/** Wartość transferu w PLN: kurs NBP z chronologii, a gdy go brak – USD po kursie bieżącym. */
export const entryPln = (t: TimelineEntry, usdPln: number): number => (t.pln ?? (t.usd === null ? 0 : t.usd * usdPln)) || 0;

export function buildFlowMap(
  chain: Chain,
  address: string,
  timeline: TimelineEntry[],
  counterparties: ChainActivity['counterparties'],
  usdPln: number,
): FlowMap {
  const catOf = new Map(counterparties.map((c) => [addressKey(chain, c.address), { category: flowCategory(c.category), label: c.label }]));
  const buckets = new Map<string, FlowBucket & { cps: Map<string, FlowCounterparty> }>();
  const own = addressKey(chain, address);
  for (const t of timeline) {
    if (t.verifiedAsset === false) continue; // fałszywe / niezweryfikowane tokeny nie są wyceniane
    const key = addressKey(chain, t.counterparty);
    if (key === own) continue; // przelew na własny adres to nie przepływ do kontrahenta
    const { category, label } = catOf.get(key) ?? { category: 'UNLABELED' as FlowCategory, label: undefined };
    const bKey = `${t.direction}:${category}`;
    const b =
      buckets.get(bKey) ??
      { category, label: FLOW_LABELS[category], direction: t.direction, pln: 0, txCount: 0, cashOut: t.direction === 'OUT' && CASH_OUT.has(category), counterpartyCount: 0, top: [], cps: new Map() };
    const pln = entryPln(t, usdPln);
    b.pln += pln;
    b.txCount++;
    const cp = b.cps.get(key) ?? { address: t.counterparty, label, pln: 0, txCount: 0 };
    cp.pln += pln;
    cp.txCount++;
    b.cps.set(key, cp);
    buckets.set(bKey, b);
  }
  const finish = (dir: 'IN' | 'OUT') =>
    [...buckets.values()]
      .filter((b) => b.direction === dir)
      .map(({ cps, ...b }) => ({
        ...b,
        pln: Math.round(b.pln * 100) / 100,
        counterpartyCount: cps.size,
        top: [...cps.values()]
          .sort((x, y) => y.pln - x.pln || y.txCount - x.txCount)
          .slice(0, 5)
          .map((c) => ({ ...c, pln: Math.round(c.pln * 100) / 100 })),
      }))
      .sort((x, y) => y.pln - x.pln || y.txCount - x.txCount);
  const inflows = finish('IN');
  const outflows = finish('OUT');
  const sum = (bs: FlowBucket[]) => Math.round(bs.reduce((s, b) => s + b.pln, 0) * 100) / 100;
  return {
    inflows,
    outflows,
    totalInPln: sum(inflows),
    totalOutPln: sum(outflows),
    cashOutPln: sum(outflows.filter((b) => b.cashOut)),
    basis:
      'Bezpośredni kontrahenci adresu (bez przelewów na własny adres) zgrupowani według kategorii etykiety (rejestr etykiet i tagi eksploratora); wartości w PLN wg kursu średniego NBP z chronologii przepływu. Tokeny spoza rejestru zweryfikowanych kontraktów pominięte.',
  };
}
