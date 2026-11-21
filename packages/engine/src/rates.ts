/**
 * Kursy do wyceny: USD/PLN z API NBP (tabela A, ostatni opublikowany kurs średni) oraz bieżące ceny krypto (CoinGecko).
 * Uwaga metodyczna: wycena wg kursu bieżącego – do rozliczeń PIT-38 wymagany kurs z dnia transakcji (wniosek do weryfikacji).
 */
import type { RateTable } from '@olcys/core';
import type { SafeFetch } from './http';

/** Kursy zapasowe – używane tylko, gdy NBP / CoinGecko są niedostępne (zawsze z adnotacją w raporcie). */
export const FALLBACK_RATES: RateTable = {
  source: 'kursy zapasowe (orientacyjne) – źródła kursów niedostępne',
  asOf: '2026-11-20',
  usdPln: 4.06,
  usd: { ETH: 1700, BTC: 59000, USDT: 1, USDC: 1, DAI: 1, TRX: 0.3, LTC: 70, SOL: 120 },
};

const COINGECKO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', TRX: 'tron', LTC: 'litecoin', SOL: 'solana', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai' };

export async function fetchLiveRates(fetch: SafeFetch, fallback: RateTable): Promise<{ rates: RateTable; errors: string[] }> {
  const errors: string[] = [];
  let usdPln = fallback.usdPln;
  let nbpDate = '';
  for (const url of ['https://api.nbp.pl/api/exchangerates/rates/a/usd/last/1/?format=json', 'https://api.nbp.pl/api/exchangerates/tables/a/last/1/?format=json']) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const d = JSON.parse(r.body);
      const row = Array.isArray(d) ? { mid: d[0].rates.find((x: { code: string }) => x.code === 'USD').mid, effectiveDate: d[0].effectiveDate, no: d[0].no } : d.rates[0];
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
