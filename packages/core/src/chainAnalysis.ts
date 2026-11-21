/**
 * Analiza aktywności adresu w blockchainie – wskaźniki wyjścia do fiat (cash-out).
 * Wejście: znormalizowane transfery adresu + (opcjonalnie) transfery kontrahentów 1 hop dalej.
 *
 * Wycena: cena aktywa w USD z dnia transakcji (gdy dostępna historia), przeliczona na PLN po kursie średnim NBP
 * z ostatniego dnia roboczego poprzedzającego transakcję (art. 11a ust. 1 ustawy o PIT). Tokeny spoza rejestru
 * zweryfikowanych kontraktów nie są wyceniane ani liczone do wskaźników (ochrona przed fałszywymi „USDT”).
 */
import { addressKey } from './chains';
import type { LabelRegistry } from './labels';
import { networkOf, resolveAsset, USD_PEGGED, EVM_NETWORKS, type ResolvedAsset } from './tokens';
import type { ActivityIndicator, AddressLabel, ChainActivity, RateTable, TimelineEntry, Transfer, Chain, AddressCategory } from './types';

export const ACTIVITY_THRESHOLDS = {
  /** Wymiana na stablecoiny uznawana za „znaczną” (USD). */
  significantSwapUsd: 1000,
  /** Adres pośredni przekazuje ≥ tyle % otrzymanych środków na giełdę → adres depozytowy. */
  depositForwardRatio: 0.9,
  depositForwardHours: 72,
  /** Wzorzec P2P: ≥ N przychodzących transferów stablecoin od różnych kontrahentów w „okrągłych” kwotach. */
  p2pMinTransfers: 4,
  p2pRoundTo: 50,
  highVolumeUsd: 20000,
};

export interface AnalyzeChainInput {
  chain: Chain;
  address: string;
  transfers: Transfer[];
  /** Transfery kontrahentów (adres → transfery) – do wykrywania adresów depozytowych giełd. */
  neighbours?: Map<string, Transfer[]>;
  labels: LabelRegistry;
  rates: RateTable;
  dataSource: string;
}

const same = (chain: Chain, a: string, b: string) => addressKey(chain, a) === addressKey(chain, b);

/** Kurs średni NBP z ostatniego dnia roboczego PRZED dniem transakcji (art. 11a ust. 1 ustawy o PIT). */
export function nbpRateBefore(rates: RateTable, timestamp: string): { date: string; no: string; mid: number } | undefined {
  const day = timestamp.slice(0, 10);
  const rows = rates.history?.nbp ?? [];
  let lo = 0;
  let hi = rows.length - 1;
  let found: (typeof rows)[number] | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date < day) {
      found = rows[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // tabela starsza niż 7 dni = brak danych dla tego okresu (nie zgadujemy kursu)
  if (found && Date.parse(day) - Date.parse(found.date) > 7 * 86400e3) return undefined;
  return found;
}

export interface Valuation {
  usd: number | null;
  priceBasis?: 'historical' | 'peg' | 'current';
  pln: number | null;
  nbp?: { date: string; no: string; mid: number };
}

/** Wycena transferu w USD i PLN (z dnia transakcji, gdy to możliwe). */
export function valueTransfer(rates: RateTable, asset: ResolvedAsset, amount: number, timestamp: string): Valuation {
  if (!asset.verified || !asset.priceKey) return { usd: null, pln: null };
  let price: number | undefined;
  let priceBasis: Valuation['priceBasis'];
  if (USD_PEGGED.has(asset.priceKey)) {
    price = 1;
    priceBasis = 'peg';
  } else {
    const hist = rates.history?.prices[asset.priceKey]?.[timestamp.slice(0, 10)];
    if (hist !== undefined) {
      price = hist;
      priceBasis = 'historical';
    } else if (rates.usd[asset.priceKey] !== undefined) {
      price = rates.usd[asset.priceKey];
      priceBasis = 'current';
    }
  }
  if (price === undefined) return { usd: null, pln: null };
  const usd = amount * price;
  const nbp = nbpRateBefore(rates, timestamp);
  return { usd, priceBasis, pln: usd * (nbp?.mid ?? rates.usdPln), nbp };
}

const CASHOUT_CATEGORIES: AddressCategory[] = ['CEX', 'CUSTODIAL'];
/** Etykiety kontraktów obowiązują tylko w sieci, w której kontrakt wdrożono; etykiety kont EOA (np. giełd) – we wszystkich sieciach EVM (ten sam klucz prywatny). */
const CONTRACT_CATEGORIES = new Set<AddressCategory>(['DEX', 'TOKEN_CONTRACT', 'SMART_CONTRACT', 'MIXER']);

export function analyzeChain(input: AnalyzeChainInput): ChainActivity {
  const { chain, address, transfers, labels, rates } = input;
  const sorted = [...transfers].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const labelAt = (t: Transfer, addr: string): AddressLabel | undefined => {
    const l = labels.get(chain, addr);
    if (!l) return undefined;
    if (chain === 'ETH' && networkOf(t) !== 'ethereum' && CONTRACT_CATEGORIES.has(l.category)) return undefined;
    return l;
  };
  const valuations = new Map<Transfer, Valuation & { asset: ResolvedAsset }>();
  const val = (t: Transfer) => {
    let v = valuations.get(t);
    if (!v) {
      const asset = resolveAsset(t);
      v = { ...valueTransfer(rates, asset, t.amount, t.timestamp), asset };
      valuations.set(t, v);
    }
    return v;
  };
  const usdOf = (t: Transfer) => val(t).usd ?? 0;
  let ignoredTokenTransfers = 0;
  let totalInPln = 0;
  let totalOutPln = 0;
  const networks = new Set<string>();
  const totals = new Map<string, { in: number; out: number }>();
  const cps = new Map<string, { address: string; label?: string; category?: AddressCategory; inUsd: number; outUsd: number; txCount: number }>();
  const timeline: TimelineEntry[] = [];
  const indicators: ActivityIndicator[] = [];
  let totalInUsd = 0;
  let totalOutUsd = 0;

  for (const t of sorted) {
    const out = same(chain, t.from, address);
    const inn = same(chain, t.to, address);
    if (!out && !inn) continue;
    const direction: 'IN' | 'OUT' = out ? 'OUT' : 'IN';
    const counterparty = out ? t.to : t.from;
    const label = labelAt(t, counterparty);
    const v = val(t);
    const usd = v.usd;
    const nw = networkOf(t);
    networks.add(nw);
    const foreignNet = chain === 'ETH' && nw !== 'ethereum' ? nw : undefined;
    if (!v.asset.verified) ignoredTokenTransfers++;
    const assetKey = `${v.asset.symbol}${foreignNet ? ` (${EVM_NETWORKS[foreignNet]?.label ?? foreignNet})` : ''}${v.asset.verified ? '' : ' – niezweryfikowany token'}`;
    const tot = totals.get(assetKey) ?? { in: 0, out: 0 };
    if (out) tot.out += t.amount;
    else tot.in += t.amount;
    totals.set(assetKey, tot);
    if (usd !== null) {
      if (out) totalOutUsd += usd;
      else totalInUsd += usd;
    }
    if (v.pln !== null) {
      if (out) totalOutPln += v.pln;
      else totalInPln += v.pln;
    }
    const key = addressKey(chain, counterparty);
    const cp = cps.get(key) ?? { address: counterparty, label: label?.entity, category: label?.category, inUsd: 0, outUsd: 0, txCount: 0 };
    cp.txCount++;
    if (usd !== null) {
      if (out) cp.outUsd += usd;
      else cp.inUsd += usd;
    }
    cps.set(key, cp);
    const notes = [t.method, v.asset.verified ? undefined : `token spoza rejestru zweryfikowanych kontraktów (${t.tokenContract}) – pominięty w wycenie i wskaźnikach, możliwy spam / fałszywy symbol`].filter(Boolean);
    timeline.push({
      timestamp: t.timestamp,
      hash: t.hash,
      direction,
      asset: v.asset.symbol,
      amount: t.amount,
      usd,
      counterparty,
      counterpartyLabel: label ? `${label.entity} (${label.category})` : undefined,
      note: notes.join(' · ') || undefined,
      network: foreignNet,
      verifiedAsset: v.asset.verified,
      priceBasis: v.priceBasis,
      pln: v.pln,
      nbp: v.nbp,
    });
  }

  const outgoing = sorted.filter((t) => same(chain, t.from, address));
  const incoming = sorted.filter((t) => same(chain, t.to, address));

  // 1) Bezpośrednie wysyłki na giełdę / custodial
  for (const cp of cps.values()) {
    if (cp.category && CASHOUT_CATEGORIES.includes(cp.category) && cp.outUsd > 0) {
      const txs = outgoing.filter((t) => same(chain, t.to, cp.address));
      indicators.push({
        type: 'CEX_DIRECT',
        severity: 'high',
        title: `Wysyłka środków na giełdę: ${cp.label}`,
        description: `${txs.length} transfer(ów) o łącznej wartości ≈ ${cp.outUsd.toFixed(2)} USD na adres oznaczony jako ${cp.label}. Możliwe wyjście do waluty tradycyjnej.`,
        basis: 'computed',
        txHashes: txs.map((t) => t.hash),
        counterparty: cp.address,
        counterpartyLabel: cp.label,
        amountUsd: cp.outUsd,
      });
    }
  }

  // 2) Wnioskowane adresy depozytowe giełd (adres pośredni → hot wallet giełdy)
  if (input.neighbours) {
    for (const [nAddr, nTransfers] of input.neighbours) {
      if (labels.get(chain, nAddr)) continue;
      const sentToIt = outgoing.filter((t) => same(chain, t.to, nAddr));
      if (sentToIt.length === 0) continue;
      const received = nTransfers.filter((t) => same(chain, t.to, nAddr));
      const forwarded = nTransfers.filter((t) => same(chain, t.from, nAddr) && CASHOUT_CATEGORIES.includes(labelAt(t, t.to)?.category as AddressCategory));
      const recvUsd = received.reduce((s, t) => s + usdOf(t), 0);
      const fwdUsd = forwarded.reduce((s, t) => s + usdOf(t), 0);
      if (recvUsd <= 0 || fwdUsd / recvUsd < ACTIVITY_THRESHOLDS.depositForwardRatio) continue;
      const lastIn = Math.max(...received.map((t) => Date.parse(t.timestamp)));
      const firstFwd = Math.min(...forwarded.map((t) => Date.parse(t.timestamp)));
      const hours = (firstFwd - lastIn) / 3.6e6;
      if (hours > ACTIVITY_THRESHOLDS.depositForwardHours) continue;
      const exchange = labelAt(forwarded[0], forwarded[0].to)!;
      const sentUsd = sentToIt.reduce((s, t) => s + usdOf(t), 0);
      indicators.push({
        type: 'CEX_DEPOSIT_INFERRED',
        severity: 'high',
        title: `Prawdopodobny adres depozytowy giełdy ${exchange.entity}`,
        description: `Adres ${nAddr} przekazał ${(100 * fwdUsd / recvUsd).toFixed(0)}% otrzymanych środków do ${exchange.entity} w ciągu ${Math.max(0, hours).toFixed(1)} h (wzorzec „sweep” konta depozytowego). Wysłano na niego ≈ ${sentUsd.toFixed(2)} USD.`,
        basis: 'inferred',
        txHashes: [...sentToIt.map((t) => t.hash), ...forwarded.map((t) => t.hash)],
        counterparty: nAddr,
        counterpartyLabel: `depozyt → ${exchange.entity}`,
        amountUsd: sentUsd,
      });
      const cp = cps.get(addressKey(chain, nAddr));
      if (cp) {
        cp.label = `Wnioskowany depozyt ${exchange.entity}`;
        cp.category = 'CEX';
      }
    }
  }

  // 3) Wymiana na stablecoiny przez DEX
  const dexTx = sorted.filter((t) => labelAt(t, t.to)?.category === 'DEX' || labelAt(t, t.from)?.category === 'DEX');
  const dexHashes = new Set(dexTx.map((t) => t.hash));
  const isStable = (t: Transfer) => val(t).asset.verified && val(t).asset.stablecoin;
  const stableIn = incoming.filter((t) => isStable(t) && (dexHashes.has(t.hash) || t.method?.toLowerCase().includes('swap')));
  const swapUsd = stableIn.reduce((s, t) => s + usdOf(t), 0);
  if (stableIn.length > 0 && swapUsd >= ACTIVITY_THRESHOLDS.significantSwapUsd) {
    const dexNames = [...new Set(dexTx.map((t) => labelAt(t, t.to)?.entity ?? labelAt(t, t.from)?.entity).filter(Boolean))];
    indicators.push({
      type: 'STABLECOIN_SWAP',
      severity: 'medium',
      title: 'Znaczna wymiana kryptowaluty na stablecoiny',
      description: `Otrzymano ≈ ${swapUsd.toFixed(2)} USD w stablecoinach (${[...new Set(stableIn.map((t) => val(t).asset.symbol))].join(', ')}) w wyniku wymiany${dexNames.length ? ` przez ${dexNames.join(', ')}` : ''}.`,
      basis: 'computed',
      txHashes: stableIn.map((t) => t.hash),
      amountUsd: swapUsd,
    });
  }

  // 4) Bramki krypto-fiat, kantory, karty
  for (const cp of cps.values()) {
    if (cp.category === 'OFFRAMP' && cp.outUsd > 0) {
      indicators.push({
        type: 'OFFRAMP',
        severity: 'high',
        title: `Interakcja z bramką krypto-fiat: ${cp.label}`,
        description: `Wysłano ≈ ${cp.outUsd.toFixed(2)} USD do usługi wymiany na walutę tradycyjną.`,
        basis: 'computed',
        txHashes: outgoing.filter((t) => same(chain, t.to, cp.address)).map((t) => t.hash),
        counterparty: cp.address,
        counterpartyLabel: cp.label,
        amountUsd: cp.outUsd,
      });
    }
    if (cp.category === 'P2P_SERVICE') {
      indicators.push({
        type: 'P2P_PATTERN',
        severity: 'medium',
        title: `Interakcja z usługą P2P: ${cp.label}`,
        description: `Transakcje z adresem usługi P2P/escrow (${cp.txCount} tx).`,
        basis: 'computed',
        txHashes: sorted.filter((t) => same(chain, t.to, cp.address) || same(chain, t.from, cp.address)).map((t) => t.hash),
        counterparty: cp.address,
        counterpartyLabel: cp.label,
      });
    }
    if (cp.category === 'MIXER' || cp.category === 'SANCTIONED') {
      indicators.push({
        type: 'MIXER_EXPOSURE',
        severity: 'high',
        title: `Kontakt z mikserem / podmiotem sankcjonowanym: ${cp.label}`,
        description: `${cp.txCount} tx z adresem ${cp.label}. Utrudnia śledzenie przepływu środków.`,
        basis: 'computed',
        txHashes: sorted.filter((t) => same(chain, t.to, cp.address) || same(chain, t.from, cp.address)).map((t) => t.hash),
        counterparty: cp.address,
        counterpartyLabel: cp.label,
      });
    }
  }

  // 5) Wzorzec handlu P2P: wiele okrągłych wpłat stablecoin od różnych osób
  const roundStable = incoming.filter((t) => isStable(t) && t.amount >= ACTIVITY_THRESHOLDS.p2pRoundTo && t.amount % ACTIVITY_THRESHOLDS.p2pRoundTo === 0 && !labelAt(t, t.from));
  const distinctSenders = new Set(roundStable.map((t) => addressKey(chain, t.from)));
  if (distinctSenders.size >= ACTIVITY_THRESHOLDS.p2pMinTransfers) {
    const usd = roundStable.reduce((s, t) => s + usdOf(t), 0);
    indicators.push({
      type: 'P2P_PATTERN',
      severity: 'medium',
      title: 'Wzorzec handlu P2P (okrągłe wpłaty stablecoin od wielu osób)',
      description: `${roundStable.length} wpłat w okrągłych kwotach od ${distinctSenders.size} różnych nieoznaczonych adresów, łącznie ≈ ${usd.toFixed(2)} USD. Typowe dla sprzedaży krypto za fiat poza giełdą.`,
      basis: 'inferred',
      txHashes: roundStable.map((t) => t.hash),
      amountUsd: usd,
    });
  }

  const histCount = timeline.filter((e) => e.nbp).length;
  const priced = timeline.filter((e) => e.pln !== null && e.pln !== undefined).length;
  const plnBasis = histCount
    ? `PLN wg kursu średniego NBP z ostatniego dnia roboczego przed transakcją (art. 11a ust. 1 ustawy o PIT) dla ${histCount} z ${priced} wycenionych transferów${histCount < priced ? `, pozostałe wg kursu ${rates.usdPln}` : ''}; ceny krypto z dnia transakcji, gdy dostępne`
    : `PLN wg bieżącego kursu USD/PLN ${rates.usdPln} (${rates.source}) – do rozliczeń PIT-38 wymagany kurs z dnia poprzedzającego transakcję`;

  // 6) Wolumen istotny podatkowo
  const volume = totalInUsd + totalOutUsd;
  if (volume >= ACTIVITY_THRESHOLDS.highVolumeUsd) {
    indicators.push({
      type: 'HIGH_VOLUME',
      severity: 'info',
      title: 'Znaczny łączny wolumen',
      description: `Łączny wolumen ≈ ${volume.toFixed(2)} USD (≈ ${(totalInPln + totalOutPln).toFixed(2)} PLN; ${plnBasis}).`,
      basis: 'computed',
      txHashes: [],
      amountUsd: volume,
    });
  }

  return {
    chain,
    address,
    dataSource: input.dataSource,
    txCount: new Set(timeline.map((t) => t.hash)).size,
    firstSeen: timeline[0]?.timestamp,
    lastSeen: timeline[timeline.length - 1]?.timestamp,
    totals: [...totals.entries()].map(([asset, v]) => ({ asset, ...v })),
    totalInUsd,
    totalOutUsd,
    totalInPln,
    totalOutPln,
    counterparties: [...cps.values()].sort((a, b) => b.inUsd + b.outUsd - (a.inUsd + a.outUsd)),
    indicators,
    timeline,
    // bez pełnych serii historycznych (duże) – w wyniku zostaje opis źródła
    rates: { source: rates.history ? `${rates.source}; historia: ${rates.history.source}` : rates.source, asOf: rates.asOf, usdPln: rates.usdPln, usd: rates.usd },
    ignoredTokenTransfers,
    plnBasis,
    networks: [...networks],
  };
}
