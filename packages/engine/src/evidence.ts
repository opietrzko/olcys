import { createHash } from 'node:crypto';
import type { EvidenceDocument, Identifier, IdentifierType } from '@olcys/core';

export type CollectedDocument = Omit<EvidenceDocument, 'id' | 'sha256' | 'sizeBytes' | 'query' | 'connector'> & { raw: string };

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function toEvidence(doc: CollectedDocument, connector: string, query: Identifier): { evidence: EvidenceDocument; raw: string } {
  const sha = sha256Hex(doc.raw);
  const id = 'ev_' + sha256Hex(`${doc.url}|${doc.archivedAt ?? ''}|${sha}`).slice(0, 16);
  const { raw, ...rest } = doc;
  return {
    evidence: {
      ...rest,
      id,
      connector,
      query,
      sha256: sha,
      sizeBytes: Buffer.byteLength(raw, 'utf8'),
      segments: rest.segments.map((s) => ({ ...s, id: `${id}#${s.id}` })),
    },
    raw,
  };
}

/** Wyszukuje w tekście identyfikatory do pivotowania (Telegram, e-mail, URL, nick GitHub). */
export function extractIdentifiers(text: string): Identifier[] {
  const out: Identifier[] = [];
  const add = (type: IdentifierType, value: string) => {
    if (!out.some((o) => o.type === type && o.value.toLowerCase() === value.toLowerCase())) out.push({ type, value });
  };
  for (const m of text.matchAll(/(?:t\.me\/|telegram[^@\n]{0,24}@|\bTG:?\s*@)([A-Za-z][A-Za-z0-9_]{4,31})/gi)) add('telegram', m[1]);
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) add('email', m[0]);
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
    const url = m[0].replace(/[.,;]+$/, '');
    const gh = url.match(/github(?:\.com)?\/([A-Za-z0-9-_]{2,39})\/?$/);
    if (gh) add('nick', gh[1]);
    else add('url', url);
  }
  return out;
}
