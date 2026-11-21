/**
 * Porównanie wyników kolejnych przebiegów analizy (analizy cykliczne)
 * oraz wykrywanie podmiany adresów publikowanych na tym samym zasobie w czasie.
 */
import { addressKey } from './chains';
import { extractAddresses } from './extract';
import type { AnalysisResult, ProfileAddressChange, RunDiff } from './result';
import type { EvidenceDocument } from './types';

export function diffRuns(baseId: string, base: AnalysisResult, headId: string, head: AnalysisResult): RunDiff {
  const b = new Map(base.findings.map((f) => [f.key, f]));
  const h = new Map(head.findings.map((f) => [f.key, f]));
  const brief = (f: AnalysisResult['findings'][number]) => ({ key: f.key, score: f.attribution.score, band: f.attribution.band });
  const newIndicators: RunDiff['newIndicators'] = [];
  for (const f of head.findings) {
    const before = new Set((b.get(f.key)?.activity?.indicators ?? []).map((i) => `${i.type}:${i.counterparty ?? ''}`));
    for (const i of f.activity?.indicators ?? []) {
      if (!before.has(`${i.type}:${i.counterparty ?? ''}`)) newIndicators.push({ key: f.key, type: i.type, title: i.title });
    }
  }
  const baseIds = new Set(base.identities.map((i) => `${i.type}:${i.value.toLowerCase()}`));
  const baseHashes = new Set(base.evidence.map((e) => e.sha256));
  return {
    baseRunId: baseId,
    headRunId: headId,
    addedAddresses: head.findings.filter((f) => !b.has(f.key)).map(brief),
    removedAddresses: base.findings.filter((f) => !h.has(f.key)).map(brief),
    scoreChanges: head.findings
      .filter((f) => b.has(f.key) && b.get(f.key)!.attribution.score !== f.attribution.score)
      .map((f) => ({ key: f.key, from: b.get(f.key)!.attribution.score, to: f.attribution.score, delta: f.attribution.score - b.get(f.key)!.attribution.score })),
    newIndicators,
    newIdentities: head.identities.filter((i) => !baseIds.has(`${i.type}:${i.value.toLowerCase()}`)).map((i) => `${i.type}:${i.value}`),
    newEvidence: head.evidence.filter((e) => !baseHashes.has(e.sha256)).length,
  };
}

/**
 * Dla zasobu (URL) obserwowanego w wielu wersjach (archiwum + stan bieżący) wylicza zmiany
 * opublikowanych adresów – np. podmianę portfela w bio profilu.
 */
export function detectProfileChanges(docs: EvidenceDocument[], urlKey: (d: EvidenceDocument) => string): ProfileAddressChange[] {
  const byUrl = new Map<string, EvidenceDocument[]>();
  for (const d of docs) {
    const k = urlKey(d);
    byUrl.set(k, [...(byUrl.get(k) ?? []), d]);
  }
  const changes: ProfileAddressChange[] = [];
  for (const [url, versions] of byUrl) {
    if (versions.length < 2) continue;
    const ordered = [...versions].sort((a, b) => (a.archivedAt ?? a.fetchedAt).localeCompare(b.archivedAt ?? b.fetchedAt));
    let prev: { doc: EvidenceDocument; set: Set<string> } | undefined;
    for (const doc of ordered) {
      const set = new Set(doc.segments.flatMap((s) => extractAddresses(s.text).map((a) => addressKey(a.chain, a.address))));
      if (prev) {
        const removed = [...prev.set].filter((x) => !set.has(x));
        const added = [...set].filter((x) => !prev!.set.has(x));
        if (removed.length || added.length) {
          changes.push({
            url,
            family: doc.family,
            from: prev.doc.archivedAt ?? prev.doc.fetchedAt,
            to: doc.archivedAt ?? doc.fetchedAt,
            removed,
            added,
            evidenceIds: [prev.doc.id, doc.id],
          });
        }
      }
      prev = { doc, set };
    }
  }
  return changes;
}
