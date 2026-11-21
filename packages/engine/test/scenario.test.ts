/**
 * SCENARIUSZE AKCEPTACYJNE (dane syntetyczne) – pełny przebieg wymagany w treści zadania:
 * wejście → ślady OSINT → wykrycie i weryfikacja adresu → Wskaźnik Pewności → odrzucenie błędnych przypisań
 * → wskaźniki aktywności blockchain → źródła i metadane.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createMockWebServer } from '../../../apps/mock-web/src/server';
import { A } from '../../../apps/mock-web/src/persona';
import { createEngine, loadConfig, renderReportHtml } from '../src';
import { addressKey, type AnalysisResult } from '@olcys/core';

let server: ReturnType<typeof createMockWebServer>;
let result: AnalysisResult;
const find = (chain: 'ETH' | 'BTC' | 'TRON', a: string) => result.findings.find((f) => f.key === addressKey(chain, a));

beforeAll(async () => {
  server = createMockWebServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const engine = createEngine(loadConfig({ MOCK_WEB_URL: `http://127.0.0.1:${port}` }));
  ({ result } = await engine.run({ identifiers: [{ type: 'nick', value: 'krypto_janek' }, { type: 'email', value: 'jan.testowy@example.com' }] }));
}, 30000);
afterAll(() => server.close());

describe('S1 – odnajdywanie adresów i łączenie źródeł', () => {
  it('znajduje główny portfel ETH (także w zapisie zaciemnionym) w ≥2 niezależnych źródłach → ≥80%', () => {
    const f = find('ETH', A.ETH_MAIN)!;
    expect(f.attribution.score).toBeGreaterThanOrEqual(80);
    expect(new Set(f.occurrences.map((o) => o.family)).size).toBeGreaterThanOrEqual(2);
    expect(f.occurrences.some((o) => o.extraction.deobfuscated)).toBe(true);
    expect(f.attribution.rules.some((r) => r.ruleId === 'SYNERGY')).toBe(true);
  });
  it('pivotuje: GitHub → Telegram → adres rozliczeniowy', () => {
    expect(result.identities.some((i) => i.type === 'telegram' && i.value === 'janek_p2p' && i.strength === 'PIVOT')).toBe(true);
    expect(find('ETH', A.ETH_TG)!.attribution.band).toBe('PRAWDOPODOBNE');
  });
  it('adres TRON z ogłoszenia P2P + kanału → wysoka pewność i wzorzec P2P/off-ramp', () => {
    const f = find('TRON', A.TRON_P2P)!;
    expect(f.attribution.score).toBeGreaterThanOrEqual(80);
    expect(f.activity!.indicators.map((i) => i.type)).toEqual(expect.arrayContaining(['P2P_PATTERN', 'OFFRAMP']));
  });
});

describe('S2 – odrzucanie fałszywych trafień', () => {
  it.each([
    ['giełda (etykieta)', A.BINANCE_14, 'CEX'],
    ['router DEX (etykieta)', A.UNISWAP_V2_ROUTER, 'DEX'],
    ['kontrakt bez etykiety (bytecode)', A.ETH_NFT_CONTRACT, 'SMART_CONTRACT'],
    ['zbiórka charytatywna', A.UKRAINE_ETH, 'CHARITY'],
  ])('%s → 0%%', (_n, addr, cat) => {
    const f = find('ETH', addr)!;
    expect(f.classification.category).toBe(cat);
    expect(f.attribution.score).toBe(0);
    expect(f.attribution.gated).toBe(true);
  });
  it('adres organizatora giveaway publikowany przez wiele osób → 0%', () => {
    expect(find('ETH', A.ETH_GIVEAWAY_ORG)!.attribution.score).toBe(0);
  });
  it('adres z giveaway → szum (<40%)', () => {
    expect(find('ETH', A.ETH_GIVEAWAY_OWN)!.attribution.band).toBe('NISKIE');
  });
  it('homonim (tylko imię i nazwisko) → <40%', () => {
    const f = find('ETH', A.ETH_HOMONYM)!;
    expect(f.attribution.score).toBeLessThan(40);
    expect(f.occurrences[0].identityLink!.strength).toBe('WEAK');
  });
});

describe('S3 – aktywność blockchain (cash-out)', () => {
  it('wykrywa swap na stablecoiny, bezpośrednią wysyłkę na giełdę i wnioskowany adres depozytowy', () => {
    const types = find('ETH', A.ETH_MAIN)!.activity!.indicators.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['STABLECOIN_SWAP', 'CEX_DIRECT', 'CEX_DEPOSIT_INFERRED']));
  });
  it('wykrywa kontakt z mikserem na starym adresie', () => {
    expect(find('ETH', A.ETH_OLD)!.activity!.indicators.map((i) => i.type)).toContain('MIXER_EXPOSURE');
  });
});

describe('S4 – zmiany w czasie, źródła i odtwarzalność', () => {
  it('wykrywa podmianę adresu na stronie WWW między wersjami archiwalnymi', () => {
    const c = result.profileChanges.find((x) => x.url.endsWith('/www/jan-testowy'))!;
    expect(c.removed).toContain(addressKey('ETH', A.ETH_OLD));
    expect(c.added).toContain(addressKey('ETH', A.ETH_MAIN));
  });
  it('każdy dowód ma URL, czas pobrania i SHA-256; każde wystąpienie wskazuje dowód', () => {
    for (const e of result.evidence) {
      expect(e.url).toBeTruthy();
      expect(e.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const ids = new Set(result.evidence.map((e) => e.id));
    for (const f of result.findings) for (const o of f.occurrences) expect(ids.has(o.evidenceId)).toBe(true);
  });
  it('raport rozróżnia fakty, obliczenia i wnioski', () => {
    const kinds = new Set(result.statements.map((s) => s.kind));
    expect(kinds).toEqual(new Set(['FACT', 'COMPUTATION', 'CONCLUSION']));
    const html = renderReportHtml(result, { runId: 'test', analysisName: 'test' });
    expect(html).toContain('FAKT ŹRÓDŁOWY');
    expect(html).toContain('WNIOSEK DO WERYFIKACJI');
  });
  it('ruch do hosta spoza allowlisty jest blokowany i odnotowany', () => {
    expect(result.egress.some((e) => e.status === 'DENIED')).toBe(true);
  });
});
