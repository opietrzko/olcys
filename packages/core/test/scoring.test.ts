import { describe, expect, it } from 'vitest';
import { assessContext, classifyAddress, computeConfidence, LabelRegistry, type Occurrence, type SourceKind, type LinkStrength } from '../src';

const reg = new LabelRegistry([{ chain: 'ETH', address: '0x28C6c06298d514Db089934071355E5743bf21d60', entity: 'Binance 14', category: 'CEX', source: 'test' }]);
let n = 0;
function occ(kind: SourceKind, family: string, text: string, strength: LinkStrength | null = 'DIRECT', author = 'janek'): Occurrence {
  return {
    id: `o${++n}`, chain: 'ETH', address: '0x1', evidenceId: 'e', segmentId: 's', url: `https://${family}/x`, family, sourceKind: kind, authorHandle: author,
    identityLink: strength ? { strength, identity: 'nick:janek', via: 'test' } : undefined,
    context: assessContext(kind, text), extraction: { raw: '', validation: 'checksum', deobfuscated: false, context: text, notes: [] },
    fetchedAt: '2025-01-01T00:00:00Z', historicalOnly: false,
  };
}
const unhosted = classifyAddress('ETH', '0xabc', reg, false);

describe('Wskaźnik Pewności', () => {
  it('profil autorski → 80–100%', () => {
    const s = computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'moje projekty open source')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(s.score).toBe(85);
    expect(s.band).toBe('BARDZO_WYSOKIE');
  });

  it('ogłoszenie P2P → 60–79%, forum → 40–59%, giveaway → 10–39%', () => {
    const p = computeConfidence({ subjectOccurrences: [occ('P2P_LISTING', 'p2p', 'sprzedam USDT')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    const f = computeConfidence({ subjectOccurrences: [occ('FORUM', 'forum', 'używam tego portfela')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    const g = computeConfidence({ subjectOccurrences: [occ('FORUM', 'forum', 'GIVEAWAY zostaw adres')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(p.band).toBe('PRAWDOPODOBNE');
    expect(f.band).toBe('SREDNIE');
    expect(g.band).toBe('NISKIE');
  });

  it('synergia +15 tylko dla niezależnych źródeł (nie dla wielu wpisów w jednym serwisie)', () => {
    const same = computeConfidence({ subjectOccurrences: [occ('FORUM', 'forum', 'a'), occ('FORUM', 'forum', 'b')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    const indep = computeConfidence({ subjectOccurrences: [occ('FORUM', 'forum', 'a'), occ('P2P_LISTING', 'p2p', 'sprzedam')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(same.rules.some((r) => r.ruleId === 'SYNERGY')).toBe(false);
    expect(indep.rules.find((r) => r.ruleId === 'SYNERGY')?.delta).toBe(15);
    expect(indep.score).toBe(85);
  });

  it('profil GitHub + strona GitHub Pages to jedno źródło (bez synergii); GitHub + inna domena – synergia', () => {
    const pages = computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'mój portfel'), occ('OWN_WEBSITE', 'janek.github.io', 'mój portfel')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    const other = computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'mój portfel'), occ('OWN_WEBSITE', 'janek.pl', 'mój portfel')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(pages.rules.some((r) => r.ruleId === 'SYNERGY')).toBe(false);
    expect(other.rules.find((r) => r.ruleId === 'SYNERGY')?.premise).toContain('github.com, janek.pl');
  });

  it('wynik nie przekracza 100%', () => {
    const s = computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'mój portfel'), occ('OWN_WEBSITE', 'www', 'mój portfel')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(s.score).toBe(100);
  });

  it('adres giełdy → 0% (bramka), nawet na profilu autorskim', () => {
    const cex = classifyAddress('ETH', '0x28c6c06298d514db089934071355e5743bf21d60', reg, false);
    const s = computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'mój portfel')], allOccurrences: [], classification: cex, verifiedOnChain: true });
    expect(s.score).toBe(0);
    expect(s.gated).toBe(true);
  });

  it('kontrakt (bytecode ≠ 0x) → 0%', () => {
    const c = classifyAddress('ETH', '0xabc', reg, true);
    expect(c.category).toBe('SMART_CONTRACT');
    expect(computeConfidence({ subjectOccurrences: [occ('OWN_PROFILE', 'github', 'x')], allOccurrences: [], classification: c, verifiedOnChain: true }).score).toBe(0);
  });

  it('homonim (tylko imię i nazwisko) obniża wynik do strefy niskiej', () => {
    const s = computeConfidence({ subjectOccurrences: [occ('FORUM', 'forum', 'sprzedam rower', 'WEAK')], allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    expect(s.score).toBeLessThan(40);
  });

  it('„wpłaciłem na …” → adres cudzy, niska pewność', () => {
    const o = occ('FORUM', 'forum', 'Wpłaciłem na ten adres wczoraj');
    expect(o.context.category).toBe('THIRD_PARTY_REFERENCE');
  });

  it('adres publikowany przez wiele obcych tożsamości → kara', () => {
    const mine = occ('FORUM', 'forum', 'mój adres');
    const foreign = ['a', 'b', 'c'].map((x) => occ('FORUM', 'forum', 'mój adres', null, x));
    const s = computeConfidence({ subjectOccurrences: [mine], allOccurrences: [mine, ...foreign], classification: unhosted, verifiedOnChain: true });
    expect(s.rules.some((r) => r.ruleId === 'CROSS_IDENTITY_REUSE')).toBe(true);
  });

  it('brak danych o aktywności adresu obniża wynik zamiast cichego 100% (bez podwójnej kary)', () => {
    const mine = [occ('OWN_PROFILE', 'github', 'mój portfel'), occ('P2P_LISTING', 't.me', 'rozliczenie')];
    const ok = computeConfidence({ subjectOccurrences: mine, allOccurrences: [], classification: unhosted, verifiedOnChain: true });
    const unchecked = computeConfidence({ subjectOccurrences: mine, allOccurrences: [], classification: unhosted, verifiedOnChain: true, activityChecked: false });
    expect(ok.score).toBe(100);
    expect(unchecked.rules.map((r) => r.ruleId)).toContain('ACTIVITY_UNCHECKED');
    expect(unchecked.score).toBe(95);
    const unverified = computeConfidence({ subjectOccurrences: mine, allOccurrences: [], classification: unhosted, verifiedOnChain: false, activityChecked: false });
    expect(unverified.rules.map((r) => r.ruleId)).not.toContain('ACTIVITY_UNCHECKED');
  });

  it('każda reguła ma przesłankę i suma reguł = wynik', () => {
    const s = computeConfidence({ subjectOccurrences: [occ('P2P_LISTING', 'p2p', 'sprzedam', 'PIVOT')], allOccurrences: [], classification: unhosted, verifiedOnChain: false });
    expect(s.rules.every((r) => r.premise.length > 0)).toBe(true);
    expect(s.rules.reduce((a, r) => a + r.delta, 0)).toBe(s.score);
  });
});
