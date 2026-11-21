/**
 * Kursy do wyceny:
 *  - bieżące: USD/PLN z API NBP (tabela A) i ceny krypto (CoinGecko) – wartość zapasowa,
 *  - historyczne: tabele A NBP z okresu transakcji (kurs z ostatniego dnia roboczego przed transakcją, art. 11a ust. 1
 *    ustawy o PIT) i dzienne ceny krypto z CoinGecko (publiczne API: ostatnie 365 dni; starsze transakcje – kurs bieżący z adnotacją).
 */
import type { RateTable } from '@olcys/core';
import type { SafeFetch } from './http';

/** Kursy zapasowe – używane tylko, gdy NBP / CoinGecko są niedostępne (zawsze z adnotacją w raporcie). */
export const FALLBACK_RATES: RateTable = {
  source: 'kursy zapasowe (orientacyjne) – źródła kursów niedostępne',
  asOf: '2026-11-20',
  usdPln: 4.06,
  usd: { ETH: 1700, BTC: 59000, USDT: 1, USDC: 1, DAI: 1, TRX: 0.3, LTC: 70, SOL: 120, POL: 0.08, BNB: 550, EURC: 1.09, PYUSD: 1, FDUSD: 1, BUSD: 1 },
};

const COINGECKO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', TRX: 'tron', LTC: 'litecoin', SOL: 'solana', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', POL: 'polygon-ecosystem-token', BNB: 'binancecoin', EURC: 'euro-coin' };

export async function fetchLiveRates(fetch: SafeFetch, fallback: RateTable): Promise<{ rates: RateTable; errors: string[] }> {
  const errors: string[] = [];
  let usdPln = fallback.usdPln;
  let nbpDate = '';
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const nbpUrls = [
    'https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json',
    'https://api.nbp.pl/api/exchangerates/rates/a/usd/last/1/?format=json',
    // zapas: zakres ostatnich 14 dni (inny punkt końcowy API NBP) – ostatnie notowanie z zakresu
    `https://api.nbp.pl/api/exchangerates/rates/a/usd/${iso(new Date(now.getTime() - 14 * 86400e3))}/${iso(now)}/?format=json`,
    'https://api.nbp.pl/api/exchangerates/tables/a/last/1/?format=json',
  ];
  for (const url of nbpUrls) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const d = JSON.parse(r.body);
      const row = Array.isArray(d) ? { mid: d[0].rates.find((x: { code: string }) => x.code === 'USD').mid, effectiveDate: d[0].effectiveDate, no: d[0].no } : d.rates[d.rates.length - 1];
      usdPln = row.mid;
      nbpDate = `${row.effectiveDate} (tabela ${row.no})`;
      break;
    } catch (e) {
      errors.push(`NBP ${new URL(url).pathname}: ${(e as Error).message}`);
    }
  }
  const usd: Record<string, number> = { ...fallback.usd };
  let cg = false;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(',')}&vs_currencies=usd`, { headers: { accept: 'application/json' } });
    const d = JSON.parse(r.body) as Record<string, { usd: number }>;
    for (const [sym, id] of Object.entries(COINGECKO_IDS)) if (d[id]?.usd) usd[sym] = d[id].usd;
    cg = true;
  } catch (e) {
    errors.push(`CoinGecko: ${(e as Error).message}`);
  }
  return {
    rates: {
      source: `${nbpDate ? `NBP USD/PLN ${usdPln} z ${nbpDate}` : `USD/PLN ${usdPln} (zapasowy)`}; ceny krypto: ${cg ? 'CoinGecko (bieżące)' : 'zapasowe'} – wycena wg kursu bieżącego`,
      asOf: new Date().toISOString().slice(0, 10),
      usdPln,
      usd,
    },
    errors,
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Dociąga kursy historyczne dla okresu transakcji: tabele A NBP (okna ≤ 93 dni – limit API NBP) i dzienne ceny krypto.
 * Wynik jest dopisywany do tabeli kursów przebiegu (cache między adresami w tym samym przebiegu).
 */
export async function extendHistoricalRates(
  fetch: SafeFetch,
  rates: RateTable,
  need: { from: string; to: string; assets: string[] },
): Promise<{ rates: RateTable; errors: string[]; fetched: string[] }> {
  const errors: string[] = [];
  const fetched: string[] = [];
  const history = rates.history ?? { nbp: [], prices: {}, source: '' };
  const today = new Date();
  // NBP: od 10 dni przed pierwszą transakcją (dzień roboczy poprzedzający), maks. 5 lat wstecz
  const minFrom = new Date(today.getTime() - 5 * 365 * 86400e3);
  const from = new Date(Math.max(Date.parse(need.from.slice(0, 10)) - 10 * 86400e3, minFrom.getTime()));
  const to = new Date(Math.min(Date.parse(need.to.slice(0, 10)), today.getTime()));
  const have = new Set(history.nbp.map((r) => r.date));
  const covered = (a: Date, b: Date) => history.nbp.length > 0 && history.nbp[0].date <= day(a) && history.nbp[history.nbp.length - 1].date >= day(new Date(b.getTime() - 4 * 86400e3));
  if (from <= to && !covered(from, to)) {
    for (let s = new Date(from); s <= to; s = new Date(s.getTime() + 93 * 86400e3)) {
      const e = new Date(Math.min(s.getTime() + 92 * 86400e3, to.getTime()));
      try {
        const url = `https://api.nbp.pl/api/exchangerates/rates/a/usd/${day(s)}/${day(e)}/?format=json`;
        let r = await fetch(url, { headers: { accept: 'application/json' } });
        // API NBP sporadycznie zwraca 5xx – jedna ponowiona próba po krótkiej przerwie
        if (r.status >= 500) {
          await new Promise((res) => setTimeout(res, 1500));
          r = await fetch(url, { headers: { accept: 'application/json' } });
        }
        if (r.status === 404) continue; // brak notowań w oknie (np. same dni wolne)
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        for (const row of (JSON.parse(r.body).rates ?? []) as { no: string; effectiveDate: string; mid: number }[]) {
          if (!have.has(row.effectiveDate)) history.nbp.push({ date: row.effectiveDate, no: row.no, mid: row.mid });
          have.add(row.effectiveDate);
        }
        fetched.push(`NBP ${day(s)}–${day(e)}`);
      } catch (err) {
        errors.push(`NBP ${day(s)}–${day(e)}: ${(err as Error).message}`);
      }
    }
    history.nbp.sort((a, b) => a.date.localeCompare(b.date));
  }
  // Ceny dzienne (USD) – stablecoiny dolarowe wyceniane parytetem 1 USD, więc pomijane
  const recentEnough = Date.parse(need.to) > today.getTime() - 365 * 86400e3;
  for (const asset of need.assets) {
    const id = COINGECKO_IDS[asset];
    if (!id || ['USDT', 'USDC', 'DAI'].includes(asset) || history.prices[asset] || !recentEnough) continue;
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`, { headers: { accept: 'application/json' } });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const series: Record<string, number> = {};
      for (const [ts, price] of (JSON.parse(r.body).prices ?? []) as [number, number][]) series[day(new Date(ts))] = price;
      history.prices[asset] = series;
      fetched.push(`CoinGecko ${asset} (365 dni)`);
    } catch (err) {
      errors.push(`CoinGecko historia ${asset}: ${(err as Error).message}`);
    }
  }
  history.source = `NBP tabela A (${history.nbp.length} notowań${history.nbp.length ? `, ${history.nbp[0].date} – ${history.nbp[history.nbp.length - 1].date}` : ''}); ceny dzienne CoinGecko: ${Object.keys(history.prices).join(', ') || 'brak'}`;
  return { rates: { ...rates, history }, errors, fetched };
}
