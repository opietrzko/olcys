/**
 * Strona WWW (np. osobista) odkryta przez link na profilu podmiotu. Pobiera tekst strony, linki rel="me", e-maile.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { familyOf } from '../config';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
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
    return [
      {
        family: familyOf(q.value),
        sourceKind: 'OWN_WEBSITE',
        url: q.value,
        title: $('title').text().trim() || q.value,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        segments: [{ id: 'page', text }],
        links: extractIdentifiers([text, ...hrefs].join('\n')).filter((l) => !(l.type === 'url' && l.value === q.value)),
        meta: { finalUrl: res.url, ownedByQuery: true },
        raw: res.body,
      },
    ];
  },
};
