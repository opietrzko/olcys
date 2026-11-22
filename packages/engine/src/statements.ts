/**
 * Rozdzielenie treści raportu na:
 *  FACT        - co zostało znalezione w źródle (cytat, URL, czas pobrania),
 *  COMPUTATION - co policzył algorytm (Wskaźnik Pewności, wolumeny, wskaźniki obliczeniowe),
 *  CONCLUSION  - interpretacje heurystyczne wymagające weryfikacji przez analityka.
 */
import type { AddressFinding, EvidenceDocument, ProfileAddressChange, Statement, SubjectIdentity } from '@olcys/core';
import { BANDS } from '@olcys/core';

const fmtUsd = (n: number) => `${n.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} USD`;
const fmtPln = (n: number) => `${n.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} PLN`;
const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

export function buildStatements(findings: AddressFinding[], identities: SubjectIdentity[], changes: ProfileAddressChange[], evidence: EvidenceDocument[]): Statement[] {
  const out: Statement[] = [];
  const ev = new Map(evidence.map((e) => [e.id, e]));

  for (const i of identities.filter((x) => x.strength === 'PIVOT')) {
    out.push({ kind: 'FACT', text: `Identyfikator ${i.type} „${i.value}” został opublikowany w źródle: ${ev.get(i.evidenceId ?? '')?.url ?? i.via}.`, evidenceIds: i.evidenceId ? [i.evidenceId] : [] });
    out.push({ kind: 'CONCLUSION', text: `Przyjęto, że identyfikator ${i.type} „${i.value}” należy do badanego podmiotu (powiązanie pośrednie – wymaga potwierdzenia).`, evidenceIds: i.evidenceId ? [i.evidenceId] : [] });
  }

  for (const f of findings) {
    for (const o of f.occurrences) {
      const d = ev.get(o.evidenceId);
      out.push({
        kind: 'FACT',
        text: `${o.archivedAt ? `Archiwalna wersja (${o.archivedAt.slice(0, 10)}) zasobu` : 'Zasób'} ${o.url} (pobrany ${o.fetchedAt.slice(0, 19).replace('T', ' ')} UTC, SHA-256 ${d?.sha256.slice(0, 12)}…) zawiera adres ${f.chain} ${f.address} opublikowany przez „${o.authorHandle ?? '?'}”: „${o.extraction.context}”.`,
        evidenceIds: [o.evidenceId],
        addressKey: f.key,
      });
    }
    if (f.classification.entity || f.classification.isContract) {
      out.push({ kind: 'FACT', text: `Adres ${short(f.address)}: ${f.classification.reasons.join('; ')}.`, evidenceIds: [], addressKey: f.key });
    }
    const rules = f.attribution.rules.map((r) => `${r.ruleId} ${r.delta >= 0 ? '+' : ''}${r.delta}`).join(', ');
    out.push({
      kind: 'COMPUTATION',
      text: `Wskaźnik Pewności dla ${f.chain} ${short(f.address)} = ${f.attribution.score}% [${rules}] (reguły ${f.attribution.rulesVersion}).`,
      evidenceIds: f.occurrences.map((o) => o.evidenceId),
      addressKey: f.key,
    });
    const band = BANDS.find((b) => b.band === f.attribution.band)!;
    if (f.attribution.gated) {
      out.push({ kind: 'CONCLUSION', text: `Adres ${short(f.address)} NIE jest przypisany podmiotowi (${band.label}); odnotowano jedynie interakcję/wzmiankę.`, evidenceIds: [], addressKey: f.key });
    } else {
      out.push({ kind: 'CONCLUSION', text: `Powiązanie adresu ${short(f.address)} z podmiotem: ${band.label}.${f.attribution.score < 60 ? ' Wymaga drugiego, niezależnego śladu.' : ''}`, evidenceIds: [], addressKey: f.key });
    }
    if (f.activity) {
      const a = f.activity;
      out.push({
        kind: 'COMPUTATION',
        text: `Aktywność ${short(f.address)} (${a.dataSource}): ${a.txCount} transakcji ${a.firstSeen?.slice(0, 10)} – ${a.lastSeen?.slice(0, 10)}; wpływy ≈ ${fmtUsd(a.totalInUsd)} (${fmtPln(a.totalInPln)}), wypływy ≈ ${fmtUsd(a.totalOutUsd)} (${fmtPln(a.totalOutPln)}) wg kursów: ${a.rates.source}.`,
        evidenceIds: [],
        addressKey: f.key,
      });
      for (const ind of a.indicators) {
        out.push({ kind: ind.basis === 'computed' ? 'COMPUTATION' : 'CONCLUSION', text: `${ind.title}: ${ind.description}`, evidenceIds: [], addressKey: f.key });
      }
    }
  }

  for (const f of findings) {
    const c = f.cluster;
    if (!c) continue;
    if (c.members.length) {
      const list = c.members.slice(0, 6).map((m) => `${short(m.address)}${m.label ? ` (${m.label})` : ''}`).join(', ');
      out.push({ kind: 'COMPUTATION', text: `Adres ${short(f.address)} był współwydawany z ${c.members.length} innymi adresami w ${c.multiInputTxs} transakcjach wielowejściowych: ${list}${c.members.length > 6 ? ', …' : ''}.`, evidenceIds: [], addressKey: f.key });
      out.push({
        kind: 'CONCLUSION',
        text: c.labeledMembers
          ? `Wśród adresów współwydawanych ${c.labeledMembers} ma etykietę instytucji – adres ${short(f.address)} może należeć do portfela giełdy / usługi, a nie osoby.`
          : `Według heurystyki wspólnego wejścia (common-input-ownership) adresy współwydawane z ${short(f.address)} prawdopodobnie należą do tego samego portfela – kandydaci do dalszej analizy.`,
        evidenceIds: [],
        addressKey: f.key,
      });
    }
    if (c.coinjoinSkipped.length) out.push({ kind: 'COMPUTATION', text: `Pominięto ${c.coinjoinSkipped.length} transakcji o cechach CoinJoin (wejścia wielu osób) – nie świadczą o wspólnym posiadaczu adresów.`, evidenceIds: [], addressKey: f.key });
  }

  for (const c of changes) {
    out.push({ kind: 'FACT', text: `Zasób ${c.url}: wersja z ${c.from?.slice(0, 10)} → wersja z ${c.to.slice(0, 10)}; usunięto: ${c.removed.join(', ') || '-'}; dodano: ${c.added.join(', ') || '-'}.`, evidenceIds: c.evidenceIds });
    if (c.removed.length && c.added.length) {
      out.push({ kind: 'CONCLUSION', text: `Na zasobie ${c.url} nastąpiła podmiana adresu portfela – oba adresy należy traktować jako potencjalnie powiązane z podmiotem w różnych okresach.`, evidenceIds: c.evidenceIds });
    }
  }
  return out;
}
