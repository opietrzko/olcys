/**
 * Nostr - profil (metadane kind 0) i ostatnie notatki konta wskazanego identyfikatorem NIP-05 (`nazwa@domena`).
 * NIP-05 to potwierdzenie właściciela domeny (plik /.well-known/nostr.json), więc konto jest powiązane z domeną e-maila.
 * Dane z publicznej bramki HTTP njump.me (otwarte oprogramowanie, odczyt z przekaźników Nostr), bez logowania.
 * Do bramki trafia wyłącznie identyfikator NIP-05; domeny skrzynek pocztowych ogólnego przeznaczenia są pomijane,
 * bo nie publikują identyfikatorów Nostr.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

const MAX_NOTES = 40;

/** Domeny poczty ogólnodostępnej - nie obsługują NIP-05 (zapytanie byłoby zbędnym ujawnieniem identyfikatora). */
const MAILBOX_DOMAINS = new Set(
  'gmail.com googlemail.com outlook.com hotmail.com live.com msn.com yahoo.com icloud.com me.com aol.com proton.me protonmail.com gmx.com gmx.net mail.com yandex.ru yandex.com zoho.com wp.pl o2.pl onet.pl op.pl interia.pl interia.eu poczta.fm tlen.pl gazeta.pl vp.pl buziaczek.pl autograf.pl'.split(' '),
);

export function isNip05Candidate(email: string): boolean {
  const m = email.trim().toLowerCase().match(/^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  return Boolean(m && !MAILBOX_DOMAINS.has(m[2]));
}

export interface NostrPage {
  pubkey?: string;
  metadata: { name?: string; display_name?: string; about?: string; website?: string; lud16?: string; nip05?: string };
  notes: { id: string; text: string; date?: string }[];
}

/** Profil i notatki ze strony njump.me (blok "Event JSON" z metadanymi i mikrodane schema.org notatek). */
/** Cloudflare zastępuje adresy e-mail w HTML zakodowanym atrybutem data-cfemail (XOR z pierwszym bajtem). */
export function decodeCfEmail(hex: string): string {
  const bytes = hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
  return String.fromCharCode(...bytes.slice(1).map((b) => b ^ bytes[0]));
}

export function parseNjump(html: string): NostrPage {
  const $ = cheerio.load(html);
  $('[data-cfemail]').each((_, e) => {
    $(e).replaceWith(decodeCfEmail($(e).attr('data-cfemail') ?? ''));
  });
  let pubkey: string | undefined;
  let metadata: NostrPage['metadata'] = {};
  const json = $('div')
    .filter((_, e) => $(e).text().trim() === 'Event JSON')
    .first()
    .next()
    .text();
  try {
    const ev = JSON.parse(json) as { pubkey?: string; kind?: number; content?: string };
    pubkey = ev.pubkey;
    if (ev.kind === 0 && ev.content) metadata = JSON.parse(ev.content);
  } catch {
    /* strona bez metadanych profilu */
  }
  const notes: NostrPage['notes'] = [];
  $('[itemtype="https://schema.org/Article"]').each((_, el) => {
    const a = $(el);
    const body = a.find('[itemprop="articleBody"]').first();
    body.find('br').replaceWith('\n');
    const id = a.find('a[itemprop="url"][href^="/nevent"], a[itemprop="url"][href^="/note"]').first().attr('href')?.slice(1);
    if (!id) return;
    notes.push({ id, text: body.text().trim(), date: a.find('[itemprop="dateCreated"]').attr('datetime') });
  });
  return { pubkey, metadata, notes: notes.slice(0, MAX_NOTES) };
}

function isoDate(d?: string): string | undefined {
  const t = d ? Date.parse(d.replace(' GMT', 'Z').replace(' ', 'T')) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export const nostrConnector: SourceConnector = {
  id: 'nostr',
  title: 'Nostr (NIP-05: profil i notatki)',
  compliance:
    'Publiczne dane protokołu Nostr przez otwartą bramkę HTTP njump.me (odczyt z przekaźników, bez logowania). Zapytanie tylko dla identyfikatora NIP-05 w domenie własnej (nie dla skrzynek ogólnodostępnych).',
  accepts: ['email'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    if (!isNip05Candidate(q.value)) return [];
    const id = q.value.trim().toLowerCase();
    const res = await ctx.fetch(`${ctx.config.urls.njump}/${encodeURIComponent(id).replace('%40', '@')}`, { headers: { accept: 'text/html' } });
    if (res.status === 404) return [];
    if (res.status !== 200) {
      ctx.warn(`Nostr ${id}: njump HTTP ${res.status}`);
      return [];
    }
    const page = parseNjump(res.body);
    // bramka pokazuje profil tylko po rozwiązaniu NIP-05 (nostr.json domeny wskazuje ten klucz publiczny)
    if (!page.pubkey) return [];
    const nip05 = page.metadata.nip05?.toLowerCase();
    if (nip05 && nip05 !== id) ctx.log(`${id}: profil Nostr deklaruje obecnie NIP-05 ${nip05} (domena ${id.split('@')[1]} nadal wskazuje ten klucz)`);
    const handle = page.metadata.name ?? id.split('@')[0];
    const owner = { handle, displayName: page.metadata.display_name };
    const profileText = [
      page.metadata.display_name,
      page.metadata.about,
      page.metadata.website && `Strona: ${page.metadata.website}`,
      page.metadata.lud16 && `Lightning: ${page.metadata.lud16}`,
      `NIP-05: ${id}`,
    ]
      .filter(Boolean)
      .join('\n');
    const url = `https://njump.me/${id}`;
    const segments: CollectedDocument['segments'] = [
      { id: 'profile', author: owner, text: profileText },
      ...page.notes.map((n) => ({ id: n.id.slice(0, 24), author: owner, text: n.text, publishedAt: isoDate(n.date), anchor: `https://njump.me/${n.id}` })),
    ];
    const links = extractIdentifiers(segments.map((s) => s.text).join('\n')).filter((l) => !(l.type === 'email' && l.value.toLowerCase() === id));
    if (page.metadata.website && !links.some((l) => l.type === 'url' && l.value === page.metadata.website)) links.unshift({ type: 'url', value: page.metadata.website });
    ctx.log(`${id}: konto Nostr ${page.pubkey.slice(0, 12)}… (NIP-05), ${page.notes.length} notatek`);
    return [
      {
        family: 'nostr',
        sourceKind: 'OWN_PROFILE',
        url,
        title: `Profil Nostr ${id}`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner,
        segments,
        links,
        meta: { pubkey: page.pubkey, nip05: id, gateway: 'njump.me', ownedByQuery: true },
        raw: res.body,
      },
    ];
  },
};
