/**
 * Kursy do wyceny:
 *  - bieżące: USD/PLN z API NBP (tabela A) i ceny krypto (CoinGecko) - wartość zapasowa,
 *  - historyczne: tabele A NBP z okresu transakcji (kurs z ostatniego dnia roboczego przed transakcją, art. 11a ust. 1
 *    ustawy o PIT) i dzienne ceny krypto: CoinGecko (publiczne API: ostatnie 365 dni) oraz - dla starszych transakcji –
 *    dzienne notowania Binance (publiczne dane rynkowe, para do USDT, cena zamknięcia dnia ≈ USD).
 *  - archiwum notowań: każda pobrana cena dzienna trafia do lokalnego archiwum (PRICE_ARCHIVE_DIR, domyślnie data/prices),
 *    więc kolejne analizy nie odpytują źródeł o te same dni, a wycena jest powtarzalna także bez dostępu do Internetu.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RateTable } from '@olcys/core';
import type { SafeFetch } from './http';

/** Kursy zapasowe - używane tylko, gdy NBP / CoinGecko są niedostępne (zawsze z adnotacją w raporcie). */
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
    // zapas: zakres ostatnich 14 dni (inny punkt końcowy API NBP) - ostatnie notowanie z zakresu
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

/** Kolejne dni RRRR-MM-DD z przedziału domkniętego (maks. ~10 lat). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && out.length < 3700; t += 86400e3) out.push(day(new Date(t)));
  return out;
}

/** Pary Binance do USDT (cena zamknięcia dnia UTC). POL przed migracją z MATIC (2024-09-13) - para MATICUSDT (wymiana 1:1). */
export const BINANCE_SYMBOLS: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', TRX: 'TRXUSDT', LTC: 'LTCUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT', POL: 'POLUSDT', EURC: 'EURUSDT' };
const POL_SINCE = '2024-09-13';
/** Pierwszy dzień notowań Binance (wcześniejszych dni nie ma sensu odpytywać). */
const BINANCE_SINCE = '2017-08-17';

/** Dzienne ceny zamknięcia z publicznego API danych rynkowych Binance (bez klucza), po 1000 dni na zapytanie. */
export async function fetchBinanceDaily(fetch: SafeFetch, asset: string, from: string, to: string): Promise<{ series: Record<string, number>; errors: string[] }> {
  const series: Record<string, number> = {};
  const errors: string[] = [];
  const ranges: { symbol: string; from: string; to: string }[] = [];
  if (from < BINANCE_SINCE) from = BINANCE_SINCE;
  if (to < from) return { series, errors };
  if (asset === 'POL' && from < POL_SINCE) {
    ranges.push({ symbol: 'MATICUSDT', from, to: to < POL_SINCE ? to : day(new Date(Date.parse(POL_SINCE) - 86400e3)) });
    if (to >= POL_SINCE) ranges.push({ symbol: 'POLUSDT', from: POL_SINCE, to });
  } else if (BINANCE_SYMBOLS[asset]) ranges.push({ symbol: BINANCE_SYMBOLS[asset], from, to });
  for (const rg of ranges) {
    for (let start = Date.parse(rg.from); start <= Date.parse(rg.to); start += 1000 * 86400e3) {
      const end = Math.min(start + 999 * 86400e3, Date.parse(rg.to)) + 86400e3 - 1;
      try {
        const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${rg.symbol}&interval=1d&startTime=${start}&endTime=${end}&limit=1000`, { headers: { accept: 'application/json' } });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        for (const k of JSON.parse(r.body) as [number, string, string, string, string][]) series[day(new Date(k[0]))] = Number(k[4]);
      } catch (e) {
        errors.push(`Binance ${rg.symbol} ${day(new Date(start))}: ${(e as Error).message}`);
        break;
      }
    }
  }
  return { series, errors };
}

/** Archiwum notowań: plik JSON na aktywo ({ "RRRR-MM-DD": cena USD }). */
function readArchive(dir: string, asset: string): Record<string, number> {
  try {
    const f = join(dir, `${asset}.json`);
    return existsSync(f) ? ((JSON.parse(readFileSync(f, 'utf8')) as { prices?: Record<string, number> }).prices ?? {}) : {};
  } catch {
    return {};
  }
}
function writeArchive(dir: string, asset: string, fresh: Record<string, number>) {
  try {
    mkdirSync(dir, { recursive: true });
    // dzień bieżący nie jest jeszcze zamknięty - nie archiwizujemy go
    const today = day(new Date());
    const prices = { ...readArchive(dir, asset), ...Object.fromEntries(Object.entries(fresh).filter(([d]) => d < today)) };
    const sorted = Object.fromEntries(Object.entries(prices).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(dir, `${asset}.json`), JSON.stringify({ asset, currency: 'USD', note: 'Archiwum dziennych cen KryptoTrop (CoinGecko / Binance)', updatedAt: new Date().toISOString(), prices: sorted }, null, 1));
  } catch {
    /* archiwum to optymalizacja - błąd zapisu nie przerywa analizy */
  }
}

/**
 * Dociąga kursy historyczne dla okresu transakcji: tabele A NBP (okna ≤ 93 dni - limit API NBP) i dzienne ceny krypto.
 * Wynik jest dopisywany do tabeli kursów przebiegu (cache między adresami w tym samym przebiegu).
 */
export async function extendHistoricalRates(
  fetch: SafeFetch,
  rates: RateTable,
  need: { from: string; to: string; assets: string[] },
  archive?: string,
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
        // API NBP sporadycznie zwraca 5xx - jedna ponowiona próba po krótkiej przerwie
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
  // Ceny dzienne (USD) - stablecoiny dolarowe wyceniane parytetem 1 USD, więc pomijane.
  // Kolejność: archiwum lokalne -> CoinGecko (ostatnie 365 dni) -> Binance (starsze dni i zapas dla CoinGecko).
  const yearAgo = day(new Date(today.getTime() - 364 * 86400e3));
  const firstDay = need.from.slice(0, 10);
  const lastDay = day(new Date(Math.min(Date.parse(need.to), today.getTime())));
  const sources = new Set<string>();
  for (const asset of need.assets) {
    if (['USDT', 'USDC', 'DAI', 'PYUSD', 'FDUSD', 'BUSD'].includes(asset)) continue;
    if (!COINGECKO_IDS[asset] && !BINANCE_SYMBOLS[asset]) continue;
    const series: Record<string, number> = { ...(history.prices[asset] ?? {}) };
    const archived = archive ? readArchive(archive, asset) : {};
    const fromArchive = Object.keys(archived).filter((d) => d >= firstDay && d <= lastDay && series[d] === undefined).length;
    Object.assign(series, archived, series);
    if (fromArchive) sources.add('archiwum lokalne');
    const missing = (a: string, b: string) => daysBetween(a, b).filter((d) => series[d] === undefined);
    const fresh: Record<string, number> = {};
    // ostatnie 365 dni - CoinGecko
    const recentMissing = lastDay >= yearAgo ? missing(firstDay > yearAgo ? firstDay : yearAgo, lastDay) : [];
    if (recentMissing.length && COINGECKO_IDS[asset]) {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${COINGECKO_IDS[asset]}/market_chart?vs_currency=usd&days=365&interval=daily`, { headers: { accept: 'application/json' } });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        for (const [ts, price] of (JSON.parse(r.body).prices ?? []) as [number, number][]) fresh[day(new Date(ts))] = price;
        fetched.push(`CoinGecko ${asset} (365 dni)`);
        sources.add('CoinGecko');
      } catch (err) {
        errors.push(`CoinGecko historia ${asset}: ${(err as Error).message}`);
      }
      Object.assign(series, fresh);
    }
    // starsze dni (i braki po CoinGecko) - Binance
    const oldMissing = missing(firstDay, lastDay);
    if (oldMissing.length && BINANCE_SYMBOLS[asset]) {
      const b = await fetchBinanceDaily(fetch, asset, oldMissing[0], oldMissing[oldMissing.length - 1]);
      Object.assign(fresh, b.series);
      Object.assign(series, b.series);
      errors.push(...b.errors);
      if (Object.keys(b.series).length) {
        fetched.push(`Binance ${asset} ${oldMissing[0]} – ${oldMissing[oldMissing.length - 1]}`);
        sources.add('Binance (para do USDT)');
      }
    }
    if (archive && Object.keys(fresh).length) writeArchive(archive, asset, fresh);
    if (Object.keys(series).length) history.prices[asset] = series;
  }
  const prev = history.source.match(/ceny dzienne \(([^)]*)\)/)?.[1]?.split(', ').filter(Boolean) ?? [];
  const src = [...new Set([...prev, ...sources])];
  history.source = `NBP tabela A (${history.nbp.length} notowań${history.nbp.length ? `, ${history.nbp[0].date} – ${history.nbp[history.nbp.length - 1].date}` : ''}); ceny dzienne (${src.join(', ') || 'brak źródła'}): ${Object.keys(history.prices).join(', ') || 'brak'}`;
  return { rates: { ...rates, history }, errors, fetched };
}
