import { createHash } from 'node:crypto';
import { extractPhones, type EvidenceDocument, type Identifier, type IdentifierType } from '@olcys/core';

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

/**
 * Właściciel strony na hostingu przypisanym do konta: `<login>.github.io` (GitHub Pages), `<login>.gitlab.io`, `<login>.codeberg.page`.
 * Subdomenę takiego hostingu może opublikować wyłącznie właściciel konta o tym loginie, więc jest to silny trop do profilu.
 */
export function pagesOwner(url: string): { service: 'github' | 'gitlab' | 'codeberg'; login: string } | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const m = host.match(/^([a-z0-9](?:[a-z0-9-]{0,38}))\.(github\.io|gitlab\.io|codeberg\.page)$/);
  if (!m) return null;
  return { service: m[2] === 'github.io' ? 'github' : m[2] === 'gitlab.io' ? 'gitlab' : 'codeberg', login: m[1] };
}

/** Wyszukuje w tekście identyfikatory do pivotowania (Telegram, e-mail, URL, nick GitHub). */
export function extractIdentifiers(text: string): Identifier[] {
  const out: Identifier[] = [];
  const add = (type: IdentifierType, value: string) => {
    if (!out.some((o) => o.type === type && o.value.toLowerCase() === value.toLowerCase())) out.push({ type, value });
  };
  for (const m of text.matchAll(/(?:t\.me\/|telegram[^@\n]{0,24}@|\bTG:?\s*@)([A-Za-z][A-Za-z0-9_]{4,31})/gi)) add('telegram', m[1]);
  for (const p of extractPhones(text)) add('phone', p);
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) add('email', m[0]);
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
    const url = m[0].replace(/[.,;]+$/, '');
    const gh = url.match(/github(?:\.com)?\/([A-Za-z0-9-_]{2,39})\/?$/);
    if (gh) add('nick', gh[1]);
    else {
      add('url', url);
      const owner = pagesOwner(url);
      if (owner?.service === 'github') add('nick', owner.login);
    }
  }
  return out;
}
