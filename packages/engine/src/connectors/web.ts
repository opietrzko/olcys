/**
 * Strona WWW (np. osobista) odkryta przez link na profilu podmiotu. Pobiera tekst strony, linki rel="me", e-maile.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { familyOf } from '../config';
import { extractIdentifiers, pagesOwner, type CollectedDocument } from '../evidence';
import { collectQrEvidence, pickQrCandidates } from '../qr';
import type { ConnectorContext, SourceConnector } from './types';

export const webConnector: SourceConnector = {
  id: 'web',
  title: 'Strony WWW (linkowane z profili)',
  compliance: 'Pobranie publicznej strony (GET) bez logowania; dowolny host publiczny z blokadą adresów wewnętrznych (ochrona SSRF).',
  accepts: ['url'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const res = await ctx.fetch(q.value, { kind: 'page' });
    if (res.status !== 200 || !/html|text/.test(res.contentType)) return [];
    const $ = cheerio.load(res.body);
    $('script,style,noscript').remove();
    const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    const hrefs = $('a[href]')
      .map((_, a) => $(a).attr('href') ?? '')
      .get()
      .map((h) => (h.startsWith('mailto:') ? h.slice(7) : h.startsWith('http') ? h : ''))
      .filter(Boolean);
    const links = extractIdentifiers([text, ...hrefs].join('\n')).filter((l) => !(l.type === 'url' && l.value === q.value));
    // Strona na GitHub Pages (`<login>.github.io`) - opublikować ją może tylko właściciel konta GitHub o tym loginie.
    const owner = pagesOwner(res.url) ?? pagesOwner(q.value);
    if (owner?.service === 'github' && !links.some((l) => l.type === 'nick' && l.value.toLowerCase() === owner.login)) {
      links.unshift({ type: 'nick', value: owner.login });
      ctx.log(`${q.value}: strona hostowana na GitHub Pages – właściciel konta GitHub „${owner.login}”`);
    }
    const page: CollectedDocument = {
      family: familyOf(q.value),
      sourceKind: 'OWN_WEBSITE',
      url: q.value,
      title: $('title').text().trim() || q.value,
      fetchedAt: res.fetchedAt,
      contentType: res.contentType,
      segments: [{ id: 'page', text }],
      links,
      meta: { finalUrl: res.url, ownedByQuery: true, ...(owner ? { pagesOwner: `${owner.service}:${owner.login}` } : {}) },
      raw: res.body,
    };
    // adresy portfeli publikowane jako kod QR (obraz)
    const images = $('img[src]')
      .map((_, im) => ({ src: $(im).attr('src') ?? '', alt: [$(im).attr('alt'), $(im).attr('title'), $(im).attr('class'), $(im).attr('id')].filter(Boolean).join(' ') }))
      .get();
    const qr = await collectQrEvidence(pickQrCandidates(images, res.url), page, ctx);
    return [page, ...qr];
  },
};
