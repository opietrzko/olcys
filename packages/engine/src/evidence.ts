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
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]`*]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    const gh = githubAccountUrl(url);
    if (gh === null) {
      if (!isPivotableUrl(url)) continue;
      add('url', url);
      const owner = pagesOwner(url);
      if (owner?.service === 'github') add('nick', owner.login);
    } else if (gh) add('nick', gh);
  }
  return out;
}

/**
 * Ścieżki github.com, które nie są kontami użytkowników (strony produktu, nawigacja serwisu).
 * GitHub nie pozwala zarejestrować loginu o takiej nazwie, więc nie mogą być tropem do osoby.
 */
const GITHUB_RESERVED = new Set(
  (
    'about account apps blog codespaces collections contact copilot customer-stories dashboard discussions education enterprise events explore ' +
    'features git-guides home issues join login logout marketplace mobile models new newsroom nonprofit notifications open-source orgs ' +
    'organizations partners premium-support pricing pulls readme resources search security settings site sitemap skills solutions ' +
    'sponsors stars team topics trending why-github signup sessions password_reset'
  ).split(' '),
);

/**
 * Link do github.com: login konta (adres profilu `github.com/<login>`), `''` dla innych stron GitHuba
 * (repozytorium, nawigacja - nie są tropem; profil i repozytoria konta zbiera konektor GitHub),
 * `null` gdy to nie jest github.com.
 */
export function githubAccountUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length !== 1 || u.search) return '';
  const login = segs[0];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) || GITHUB_RESERVED.has(login.toLowerCase())) return '';
  return login;
}

/** Serwisy, których strony nie mówią nic o osobie: czaty AI, wyszukiwarki, encyklopedie, standardy. */
const NON_PIVOT_HOSTS = /(^|\.)(claude\.ai|chatgpt\.com|chat\.openai\.com|perplexity\.ai|google\.[a-z.]+|bing\.com|duckduckgo\.com|wikipedia\.org|wikimedia\.org|w3\.org|schema\.org|creativecommons\.org)$/i;

/**
 * Czy link warto odwiedzić jako trop: poprawny publiczny URL, a nie strona logowania / rejestracji,
 * przycisk "udostępnij" ani serwis ogólny (czat AI, wyszukiwarka, encyklopedia).
 */
export function isPivotableUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return false;
  if (NON_PIVOT_HOSTS.test(u.hostname)) return false;
  if (/^(auth|login|signin|signup|accounts|account|id|sso)\./i.test(u.hostname)) return false;
  if (/(^|\/)(sign[-_]?up|sign[-_]?in|log[-_]?in|log[-_]?out|register|oauth2?|authorize|share|sharer(\.php)?|intent)(\/|$)/i.test(u.pathname)) return false;
  return true;
}
