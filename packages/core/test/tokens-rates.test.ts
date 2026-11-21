import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeChain, inferInstitutional, LabelRegistry, nbpRateBefore, sourceService, synthetic, validateAddress, addressKey, type RateTable, type Transfer } from '../src';

const me = synthetic.eth('me');
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const FAKE_USDT = synthetic.eth('fake-usdt-contract');
const labels = new LabelRegistry([]);
const rates: RateTable = {
  source: 'test',
  asOf: '2026-11-20',
  usdPln: 4,
  usd: { ETH: 3000, USDT: 1 },
  history: {
    nbp: [
      { date: '2026-03-05', no: '45/A/NBP/2026', mid: 3.9 },
      { date: '2026-03-06', no: '46/A/NBP/2026', mid: 3.8 },
      { date: '2026-03-09', no: '47/A/NBP/2026', mid: 3.7 },
    ],
    prices: { ETH: { '2026-03-09': 2000 } },
    source: 'test',
  },
};
const tr = (hash: string, ts: string, from: string, to: string, asset: string, amount: number, tokenContract?: string): Transfer => ({ chain: 'ETH', hash, timestamp: ts, from, to, asset, amount, tokenContract });

describe('fałszywe tokeny', () => {
  it('„USDT” z nieznanego kontraktu nie jest wyceniany ani liczony do wzorca P2P', () => {
    const fake = [1, 2, 3, 4, 5].map((i) => tr(`f${i}`, '2026-03-09T10:00:00Z', synthetic.eth(`s${i}`), me, 'USDT', 5000, FAKE_USDT));
    const a = analyzeChain({ chain: 'ETH', address: me, transfers: fake, labels, rates, dataSource: 't' });
    expect(a.indicators.map((i) => i.type)).not.toContain('P2P_PATTERN');
    expect(a.indicators.map((i) => i.type)).not.toContain('HIGH_VOLUME');
    expect(a.totalInUsd).toBe(0);
    expect(a.ignoredTokenTransfers).toBe(5);
    expect(a.timeline[0].verifiedAsset).toBe(false);
  });

  it('prawdziwy USDT (zweryfikowany kontrakt) liczy się do wzorca P2P', () => {
    const real = [1, 2, 3, 4].map((i) => tr(`r${i}`, '2026-03-09T10:00:00Z', synthetic.eth(`s${i}`), me, 'USDT', 500, USDT));
    const a = analyzeChain({ chain: 'ETH', address: me, transfers: real, labels, rates, dataSource: 't' });
    expect(a.indicators.map((i) => i.type)).toContain('P2P_PATTERN');
    expect(a.totalInUsd).toBe(2000);
  });
});

describe('kurs NBP do PIT-38 (art. 11a ust. 1)', () => {
  it('bierze kurs z ostatniego dnia roboczego PRZED dniem transakcji', () => {
    // poniedziałek 2026-03-09 → piątek 2026-03-06 (nie kurs z dnia transakcji)
    expect(nbpRateBefore(rates, '2026-03-09T12:00:00Z')?.date).toBe('2026-03-06');
    // niedziela 2026-03-08 → piątek 2026-03-06
    expect(nbpRateBefore(rates, '2026-03-08T12:00:00Z')?.mid).toBe(3.8);
    // brak tabeli w ostatnich 7 dniach → brak kursu (bez zgadywania)
    expect(nbpRateBefore(rates, '2026-06-01T00:00:00Z')).toBeUndefined();
  });

  it('wycenia ETH ceną z dnia transakcji i przelicza na PLN kursem NBP z dnia poprzedniego', () => {
    const a = analyzeChain({ chain: 'ETH', address: me, transfers: [tr('h', '2026-03-09T10:00:00Z', synthetic.eth('x'), me, 'ETH', 1)], labels, rates, dataSource: 't' });
    const e = a.timeline[0];
    expect(e.usd).toBe(2000);
    expect(e.priceBasis).toBe('historical');
    expect(e.nbp?.no).toBe('46/A/NBP/2026');
    expect(e.pln).toBeCloseTo(7600);
    expect(a.totalInPln).toBeCloseTo(7600);
  });
});

describe('adres instytucjonalny (heurystyka)', () => {
  it('wiele tysięcy transakcji → wniosek CUSTODIAL; zwykły portfel → brak', () => {
    expect(inferInstitutional('ETH', me, [], { txCount: 120000 })?.category).toBe('CUSTODIAL');
    const many = Array.from({ length: 320 }, (_, i) => ({ from: synthetic.eth(`c${i}`), to: me }));
    expect(inferInstitutional('ETH', me, many)?.reason).toContain('320 różnych kontrahentów');
    expect(inferInstitutional('ETH', me, many.slice(0, 20), { txCount: 40 })).toBeUndefined();
  });
});

describe('synergia: pochodzenie źródła', () => {
  it('strona GitHub Pages to ta sama usługa co profil GitHub', () => {
    expect(sourceService('kordas-dev.github.io')).toBe('github.com');
    expect(sourceService('github')).toBe('github.com');
    expect(sourceService('blog.example.com.pl')).toBe('example.com.pl');
    expect(sourceService('t.me')).toBe('telegram');
  });
});

describe('zbiór etykiet', () => {
  it('każdy adres w data/labels ma poprawną sumę kontrolną i jest unikalny', () => {
    const d = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/labels/known-public-entities.json'), 'utf8')) as { labels: { chain: 'ETH'; address: string }[] };
    const keys = new Set<string>();
    for (const l of d.labels) {
      const v = validateAddress(l.address);
      expect(v.valid, l.address).toBe(true);
      expect(v.chain).toBe(l.chain);
      keys.add(addressKey(l.chain, l.address));
    }
    expect(keys.size).toBe(d.labels.length);
  });
});
