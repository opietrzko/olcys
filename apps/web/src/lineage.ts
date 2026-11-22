import type { AnalysisResult, EvidenceDocument, SubjectIdentity } from '@olcys/core';

/** Klucz węzła tożsamości w grafie i w inspektorze. */
export const identityNodeId = (type: string, value: string) => `id:${type}:${value.toLowerCase()}`;

type Ev = Omit<EvidenceDocument, 'segments'>;

export interface Lineage {
  /** Węzeł, z którego wyszedł trop (rodzic w grafie); 'subject' dla danych wejściowych. */
  parent: Map<string, string>;
  /** Kolumna węzła tożsamości (podmiot = 0). */
  column: Map<string, number>;
  /** Węzeł-konto, któremu "należy" dokument: właściciel (nick/Telegram) albo tożsamość, którą o niego zapytano. */
  docNode: Map<string, string>;
  /** Dokumenty przypisane do węzła tożsamości. */
  docsOf: (nodeId: string) => Ev[];
}

/**
 * Pochodzenie tropów w jednym miejscu (graf i inspektor czytają to samo):
 * dokument należy do konta, którego właścicielem jest (np. profil GitHub -> nick), a gdy właściciela nie ma
 * w grafie - do tożsamości, o którą zapytano. Tropy z dokumentu są dziećmi tego konta.
 */
export function buildLineage(r: AnalysisResult): Lineage {
  const ids = new Map<string, SubjectIdentity>();
  for (const i of r.identities) {
    const k = identityNodeId(i.type, i.value);
    if (!ids.has(k)) ids.set(k, i);
  }
  // ten sam login bywa nickiem i kontem Telegram - dokument z Telegrama należy do węzła Telegram, każdy inny do nicka
  const nickByHandle = new Map<string, string>();
  const tgByHandle = new Map<string, string>();
  for (const [k, i] of ids) {
    if (i.type === 'nick' && !nickByHandle.has(i.value.toLowerCase())) nickByHandle.set(i.value.toLowerCase(), k);
    if (i.type === 'telegram' && !tgByHandle.has(i.value.toLowerCase())) tgByHandle.set(i.value.toLowerCase(), k);
  }
  const accountFor = (e: Ev, handle: string) => (e.connector === 'telegram' ? (tgByHandle.get(handle) ?? nickByHandle.get(handle)) : (nickByHandle.get(handle) ?? tgByHandle.get(handle)));

  const docNode = new Map<string, string>();
  const evById = new Map<string, Ev>();
  for (const e of r.evidence) {
    evById.set(e.id, e);
    const q = identityNodeId(e.query.type, e.query.value);
    const owner = e.owner?.handle ? accountFor(e, e.owner.handle.replace(/^@/, '').toLowerCase()) : undefined;
    docNode.set(e.id, owner ?? q);
  }

  const parent = new Map<string, string>();
  for (const [k, i] of ids) {
    const ev = i.evidenceId ? evById.get(i.evidenceId) : undefined;
    if (!ev) {
      parent.set(k, 'subject');
      continue;
    }
    let p = docNode.get(ev.id);
    // konto odkryte na własnym profilu (np. login z wyników po imieniu) - rodzicem jest tożsamość, o którą zapytano
    if (!p || p === k) p = identityNodeId(ev.query.type, ev.query.value);
    parent.set(k, p !== k && ids.has(p) ? p : 'subject');
  }

  const column = new Map<string, number>([['subject', 0]]);
  const colOf = (k: string, guard = 0): number => {
    if (column.has(k)) return column.get(k)!;
    const p = parent.get(k) ?? 'subject';
    const c = guard > 20 ? 1 : colOf(p, guard + 1) + 1;
    column.set(k, c);
    return c;
  };
  for (const k of ids.keys()) colOf(k);

  return {
    parent,
    column,
    docNode,
    docsOf: (nodeId) => r.evidence.filter((e) => docNode.get(e.id) === nodeId && !e.archivedAt),
  };
}
