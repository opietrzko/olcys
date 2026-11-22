/**
 * Bitcointalk - profil użytkownika (podpis, strona WWW) i jego posty.
 * Nazwa użytkownika -> UID i posty z publicznego archiwum forum ninjastic.space (API bez klucza),
 * profil z publicznej strony bitcointalk.org (bez logowania). Cytaty innych użytkowników są usuwane z treści postów,
 * bo adres w cytacie nie jest adresem autora.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

interface NjPost {
  post_id: string | number;
  topic_id: string | number;
  author: string;
  author_uid: string | number;
  title?: string;
  content: string;
  date?: string;
  board_name?: string;
}

const MAX_POSTS = 50;

/** Tekst postu Bitcointalk (HTML SMF) bez cytatów innych osób. */
export function bitcointalkPostText(html: string): string {
  const $ = cheerio.load(`<div id="p">${html}</div>`);
  $('.quoteheader, .quote, .codeheader').remove();
  $('br').replaceWith('\n');
  const hrefs = $('a[href]')
    .map((_, a) => $(a).attr('href') ?? '')
    .get()
    .filter((h) => h.startsWith('http'));
  return [$('#p').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(), ...hrefs].join('\n');
}

/** Pola profilu SMF: podpis i strona WWW. */
export function parseBitcointalkProfile(html: string): { name?: string; signature: string; website?: string; location?: string } {
  const $ = cheerio.load(html);
  const field = (label: string) => {
    const td = $('td')
      .filter((_, e) => $(e).children('b').first().text().trim().replace(/:$/, '') === label)
      .first();
    return td.next('td').text().trim() || undefined;
  };
  const sig = $('div.signature').first();
  sig.find('br').replaceWith('\n');
  const sigLinks = sig
    .find('a[href]')
    .map((_, a) => $(a).attr('href') ?? '')
    .get()
    .filter((h) => h.startsWith('http'));
  const website = $('td')
    .filter((_, e) => $(e).children('b').first().text().trim().replace(/:$/, '') === 'Website')
    .first()
    .next('td')
    .find('a[href]')
    .attr('href');
  return { name: field('Name'), signature: [sig.text().trim(), ...sigLinks].filter(Boolean).join('\n'), website: website || undefined, location: field('Location') };
}

export const bitcointalkConnector: SourceConnector = {
  id: 'bitcointalk',
  title: 'Bitcointalk (profil, podpis i posty)',
  compliance:
    'Publiczny profil bitcointalk.org (GET, bez logowania) i publiczne archiwum postów forum ninjastic.space (API bez klucza). Cytaty innych użytkowników są pomijane.',
  accepts: ['nick'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const api = ctx.config.urls.ninjasticApi;
    const nick = q.value.trim().replace(/^@/, '');
    const u = await ctx.fetch(`${api}/users/${encodeURIComponent(nick)}`, { headers: { accept: 'application/json' } });
    if (u.status === 404) return [];
    if (u.status !== 200) {
      ctx.warn(`Bitcointalk ${nick}: archiwum ninjastic HTTP ${u.status}`);
      return [];
    }
    const user = JSON.parse(u.body) as { result?: string; data?: { author?: string; author_uid?: number; posts_count?: number } };
    const uid = user.data?.author_uid;
    if (user.result !== 'success' || !uid || user.data?.author?.toLowerCase() !== nick.toLowerCase()) return [];
    const author = user.data!.author!;
    const owner = { handle: author };
    const docs: CollectedDocument[] = [];

    const profileUrl = `https://bitcointalk.org/index.php?action=profile;u=${uid}`;
    try {
      const pr = await ctx.fetch(profileUrl, { kind: 'page' });
      if (pr.status === 200) {
        const p = parseBitcointalkProfile(pr.body);
        const text = [p.name && `Imię: ${p.name}`, p.location && `Lokalizacja: ${p.location}`, p.website && `Strona: ${p.website}`, p.signature && `Podpis: ${p.signature}`].filter(Boolean).join('\n');
        docs.push({
          family: 'bitcointalk.org',
          sourceKind: 'OWN_PROFILE',
          url: profileUrl,
          title: `Profil Bitcointalk ${author} (u=${uid})`,
          fetchedAt: pr.fetchedAt,
          contentType: pr.contentType,
          owner,
          segments: [{ id: 'profile', author: owner, text }],
          links: extractIdentifiers(text),
          meta: { uid, postsCount: user.data?.posts_count, ownedByQuery: true },
          raw: pr.body,
        });
      } else ctx.warn(`Bitcointalk profil u=${uid}: HTTP ${pr.status}`);
    } catch (e) {
      ctx.warn(`Bitcointalk profil u=${uid}: ${(e as Error).message}`);
    }

    const ps = await ctx.fetch(`${api}/posts?author=${encodeURIComponent(author)}&limit=${MAX_POSTS}`, { headers: { accept: 'application/json' } });
    if (ps.status !== 200) {
      ctx.warn(`Bitcointalk ${author}: posty z archiwum HTTP ${ps.status}`);
      return docs;
    }
    const posts = ((JSON.parse(ps.body).data?.posts ?? []) as NjPost[]).filter((p) => String(p.author_uid) === String(uid));
    if (posts.length) {
      const segments = posts.map((p) => ({
        id: `msg${p.post_id}`,
        author: owner,
        text: [p.title, bitcointalkPostText(p.content)].filter(Boolean).join('\n'),
        publishedAt: p.date,
        anchor: `https://bitcointalk.org/index.php?topic=${p.topic_id}.msg${p.post_id}#msg${p.post_id}`,
      }));
      docs.push({
        family: 'bitcointalk.org',
        sourceKind: 'FORUM',
        url: `https://bitcointalk.org/index.php?action=profile;u=${uid};sa=showPosts`,
        title: `Posty Bitcointalk ${author} (${posts.length} najnowszych)`,
        fetchedAt: ps.fetchedAt,
        contentType: ps.contentType,
        owner,
        segments,
        // linki do innych wątków / profili forum to treści innych osób - nie są tropem do podmiotu
        links: extractIdentifiers(segments.map((s) => s.text).join('\n')).filter((l) => !(l.type === 'url' && /^https?:\/\/(www\.)?bitcointalk\.org\//i.test(l.value))),
        meta: { api: ps.url, uid, archive: 'ninjastic.space', ownedByQuery: true },
        raw: ps.body,
      });
    }
    ctx.log(`${nick}: konto Bitcointalk u=${uid}, ${posts.length} postów z archiwum`);
    return docs;
  },
};
